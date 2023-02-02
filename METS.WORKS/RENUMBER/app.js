/*
* version 0.3.0
* February 2023
* Nicolaie Constantinescu, <kosson@gmail.com>
*/

const xml2js = require('xml2js');
const fs = require('fs/promises');
const globby = require('globby');
const { stat, constants } = require('fs');
const { Buffer } = require('node:buffer');
const { Console } = require('console');

// Îmi trebuie un hash {name: nume_fisier, path: cale relativă}
// https://attacomsian.com/blog/nodejs-convert-xml-to-json
// https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

try {

    /**
     * Recursively create a directory at the given `path`.
     * @param {String} path
     */
    async function ensureDir(path) {  
        await fs.mkdir(path, { recursive: true });
    }

    /**
     * Funcția returnează `true` dacă un fișier există
     * @param {String} path 
     * @returns 
     */
    const fileExists = path => fs.stat(path).then(() => true, () => false);


    /**
     * Funcția are rolul de a scrie fișierul pe disc
     * @param {String} source 
     * @param {String} destination 
     * @param {String} file 
     * @return {Boolean} false pentru cazul în care fișierul deja există, true pentru cazul în care a fost scris pe disc
     */
    async function writeTheFile (source, destination) {
        try {
            let state = await fileExists(destination);
            if (state) {
                console.log(`Fișierul pe care vrei să-l scrii (${destination}) există deja.`)
                return false;
            } else {
                let fexists = await fs.access(source, constants.F_OK);
                if (fexists === undefined) {
                    await fs.copyFile( source, destination);
                    return true;
                };
            }
        } catch (error) {
            console.error(`A aparut o eroare la scrierea pe disc. Fișierul este ${source} `, error);
        }
    }
 
    /**
     * Este o funcție recursivă care are rolul de a prelucra obiectul ce reprezintă structura fișierului .mets
     * Populează Set-ul `xobject`
     * Toate proprietățile au drept valoare un array indiferent de datele care sunt acolo. Această structură o generează `xml2js`
     * @param {Object} obj este obiectul reprezentare a unui element XML
     * @see fileNameExtractor
     */
     function revealHref (obj, state) {

        if (Array.isArray(obj)) {
            let element;
            for (element of obj) {
                // cazul array de `fileGrp` a lui `fileSec` care are array-uri de `fileGrp` la rândul său
                if (element['mets:fileGrp'] != null) {
                    // dacă elementul conține un array, apelează recursiv și pasează starea
                    if (Array.isArray(element['mets:fileGrp'])) {
                        // console.log(JSON.stringify(obj['mets:fileGrp']));
                        revealHref(element['mets:fileGrp'], state);
                    }
                }

                if (Array.isArray(element['mets:file'])) {
                    for (let record of element['mets:file']) {
                        // console.log(`Inregistrarea este `, record);
                        record['created'] = record?.CREATED[0];   // completează obiectul state
                        record['groupid'] = record?.GROUPID[0];
                        record['id'] = record?.ID[0];
                        let pathSegments = record['mets:FLocat'][0]['xlink:href'][0].split("\\");
                        let nixPathRoot = `${pathSegments[0]}/DOCS/${pathSegments[1]}`;
                        record['dir'] = nixPathRoot;
                        record['path'] = `${nixPathRoot}/${pathSegments[2]}`;
                        record['kontor'] = state['kontor']++; // incrementează contorul
                        state?.data.push(record);
                    }
                }
            }

        }
        
        return state;
    };

    /**
     * Funcția extrage căile directoarelor și apelează `fileNameExtractor()` pe fiecare
     * Aceasta este funcția care inițializează procesul
     * @see fileNameExtractor
     */
    async function workOnpaths () {
        let paths = await globby(['./DOCS/**/*.mets']);
        paths.map(fileNameExtractor);
    };
    
    /**
     * Funcția va prelucra fișierul cu extensia .mets din calea pasată
     * @param {String} path O cale a fișierului .mets extrasă de globby la parsarea structurii de subdirectoare din ./DOCS
     */
    async function fileNameExtractor (path) {

        try {
            const xml = await fs.readFile(path); // citește .mets
            let result = await xml2js.parseStringPromise(xml, { mergeAttrs: true }); // creeează o reprezentare obiect a XML
            let representation = result['mets:mets']['mets:structMap'];
            // în cazul în care ai o proprietate `mets:fileSec` în rădăcină
            if (result['mets:mets']['mets:fileSec']) {

                let records = revealHref(result['mets:mets']['mets:fileSec'], {
                    kontor:  0,
                    data: []
                }); // prelucrează recursiv reprezentarea obiect

                // creează un array în care sortezi obiectele după data la care au fost create fișierele

                let filteredByCreation = records?.data.sort((a, b) => {
                    // return new Date(d1).valueOf() - new Date(d2).valueOf();
                    return a.created > b.created ? 1 : a.created < b.created ? -1 : 0;
                }).map((obj, idx) => {
                    obj['idx'] = idx;
                    return obj;
                });

                // Creează raportul ca fișier CSV în /renumbered
                let report = `"idxarr", "timestamp", "created", "groupid", "id", "path" \n`;
                let loggedTable = filteredByCreation.map((obiRec, idx) => {
                    return `"${idx}","${new Date(obiRec.created).valueOf()}", "${obiRec.created}", "${obiRec.groupid}","${obiRec.id}","${obiRec.path}"`;
                }).join("\n");
                let fileContent = report+=loggedTable;

                let destinationPath = filteredByCreation[0].dir;
                let reportFileNameBit = destinationPath.split('/')[2];
                let reportFileName = 'log_' + reportFileNameBit.split(' ').join('_');

                // Asigură-te că există subdirectorul
                await ensureDir(`${filteredByCreation[0].dir}/renumbered`);
                // Creează un Buffer
                const data = new Uint8Array(Buffer.from(fileContent));
                // Scrie Buffer-ul pe disc
                await fs.writeFile(`${filteredByCreation[0].dir}/renumbered/${reportFileName}.csv`, data);

                // declanșează procesul de copiere și redenumire.
                filteredByCreation.forEach(processRecord);
            } else {
                console.log('File Sequence nu este găsit');
            }
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * Funcția face prelucrarea fiecărui fișier în parte
    */
    async function processRecord (obj) {
        let {created, dir, path, idx} = obj;
        let timestamp = new Date(created).valueOf();
        let targetSubdir = `${dir}/renumbered`;
        await ensureDir(targetSubdir); // asigură-te că există subdirectorul în care scrii
        await writeTheFile(path, `${targetSubdir}/${timestamp}_${idx}.tif`); // copiază și redenumește fișierul  
    }

    // Funcția care apelată va porni prelucrarea
    workOnpaths();
} catch (error) {
    console.error(error);
}