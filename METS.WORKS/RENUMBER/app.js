/*
* Renumber - aplicație care renumerotează fișierele create de CopyBook cu nume în ordinea în care au fost create fișierele la momentul scanării
* version 0.2.0
* January 2023
* Aplicația acoperă doar cazul în care s-a corectat pe loc prin ștergere și creare de imagine în continuare.
* Acest lucru înseamnă că timestamp-ul este un criteriu valid de ordonare.
* Nu tratează cazul în care s-a revenit ulterior la o distanță în timp.
* O versiune ulterioară trebuie să refacă structura din `mets:structMap` cu date din `mets:fileSec`
* Nicolaie Constantinescu, <kosson@gmail.com>
* Pentru NIPNE, Biblioteca Națională de Fizică
*/

const xml2js = require('xml2js');
const fs = require('fs/promises');
const globby = require('globby');
const { stat, constants } = require('fs');

// Îmi trebuie un hash {name: nume_fisier, path: cale relativă}
// https://attacomsian.com/blog/nodejs-convert-xml-to-json
// https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c
// let paths = globby(['./DOCS/**/*.mets']);

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
            throw new Error("A aparut o eroare la scrierea pe disc", error);
        }
    }
 
    let xobject = new Set(); // structura care acumulează înregistrările (vin din `revealHref`) din care se creează array-ul

    /**
     * Este o funcție recursivă care are rolul de a prelucra obiectul ce reprezintă structura fișierului .mets
     * Populează Set-ul `xobject`
     * Toate proprietățile au drept valoare un array indiferent de datele care sunt acolo. Această structură o generează `xml2js`
     * @param {Object} obj este obiectul reprezentare a unui element XML
     * @param {Object} state Obiectul va fi pasat imediat după ce returnează (invocare în `fileNameExtractor`)
     * @param {Number} state.kontor este numărul de ordine care va fi atașat ultimul în formarea numelui noului fișier tif
     * @param {String} state.created este data calendaristică la care a fost creat fișierul
     * @param {String} state.path este calea fișierului care urmează a fi redenumit și scris pe disc în ./renumbered
     * @see fileNameExtractor
     */
    async function revealHref (obj, state) {
        let newRecord = {};

        // Prelucrează recursiv array-urile care sunt valorile cheilor
        if (Array.isArray(obj)) {
            let elem;
            for (elem of obj) {
                revealHref(elem, state);
            }
        }

        // cazul array de `fileGrp` a lui `fileSec` care are array-uri de `fileGrp` la rândul său
        if (obj['mets:fileGrp'] != null) {
            // dacă elementul conține un array, apelează recursiv și pasează starea
            if (Array.isArray(obj['mets:fileGrp'])) {
                revealHref(obj['mets:fileGrp'], state);
            }
        }
        
        // când ai găsit mets:file, trimite înregistrarea în `xobject`
        if (obj['mets:file'] != null) {
            let record; // folosit în for (pentru debug)
            if (obj['mets:file'].length > 0) {
                // cazul array-ului de fișiere
                for (record of obj['mets:file']) {
                    newRecord['created'] = record?.CREATED[0];   // completează obiectul state
                    newRecord['groupid'] = record?.GROUPID[0];
                    newRecord['id'] = record?.ID[0];
                    let pathSegments = record['mets:FLocat'][0]['xlink:href'][0].split("\\");
                    let nixPathRoot = `${pathSegments[0]}/DOCS/${pathSegments[1]}`;
                    newRecord['dir'] = nixPathRoot;
                    newRecord['path'] = `${nixPathRoot}/${pathSegments[2]}`;
                    newRecord['record'] = record;
                    state['kontor']++;          // incrementează contorul
                    xobject.add(newRecord); // în `xobject`
                }
            } else {
                newRecord['created'] = record?.CREATED[0];   // completează obiectul state
                newRecord['groupid'] = record?.GROUPID[0];
                newRecord['id'] = record?.ID[0];
                let pathSegments = record['mets:FLocat'][0]['xlink:href'][0].split("\\");
                let nixPathRoot = `${pathSegments[0]}/DOCS/${pathSegments[1]}`;
                newRecord['dir'] = nixPathRoot;
                newRecord['path'] = `${nixPathRoot}/${pathSegments[2]}`;
                newRecord['record'] = record;
                state['kontor']++;                      // incrementează contorulâ
                xobject.add(newRecord); // în `xobject`
            }
            // console.log(`Obiectul stare este `, state);
        }

        // setează valoarea `state.created` din obiectul `state` 
        if (obj['CREATED'] != null) {
            newRecord['created'] = obj['CREATED'][0];             
        }

        // este cazul unei chei mets:FLocat, deci prelucrează recursiv
        if (obj['mets:FLocat'] != null) {
            revealHref(obj['mets:FLocat'], state);
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

        console.log(`Calea adăugată pentru prelucrare este: `, path);

        const xml = await fs.readFile(path); // citește .mets
        let result = await xml2js.parseStringPromise(xml, { mergeAttrs: true }); // creeează o reprezentare obiect a XML
        
        // în cazul în care ai o proprietate `mets:fileSec` în rădăcină
        if (result['mets:mets']['mets:fileSec']) {
            await revealHref(result['mets:mets']['mets:fileSec'], {
                kontor:  0
            }); // prelucrează recursiv reprezentarea obiect pentru a popula `xobject`

            // creează un array în care sortezi obiectele după data la care au fost create fișierele
            // Set-ul xobject conține obiecte pentru fiecare cale de fișier din fiecare subdirector. 

            let filteredByCreation = [...xobject].map((obj) => {
                return new Date(obj.created).valueOf();
            }).sort((d1, d2) => {
                return new Date(d1).valueOf() - new Date(d2).valueOf();
            });

            // injectezi o proprietate nouă `idx` obiectelor pe care îl faci apendice la numele nou al fișierului
            let obiRec;
            for (obiRec of [...xobject]) {
                let timestamp = new Date(obiRec.created).valueOf();

                if (filteredByCreation.includes(timestamp)) {
                    // introdu proprietatea `idx` cu valoarea poziției din array-ul sortat
                    xobject.delete(obiRec);
                    obiRec['idx'] = filteredByCreation.indexOf(timestamp);
                    obiRec['timestamp'] = timestamp;
                    xobject.add(obiRec);
                }
            }

            // for (obiRec of xobject) {
            //     console.log(`ACUM: `, obiRec);
            // }

            xobject.forEach(processRecord);

            xobject.clear();
        } else {
            console.log('File Sequence nu este găsit');
        }
    }

    /**
     * Funcția face prelucrarea fiecărui fișier în parte
    */
    async function processRecord (obj) {
        let {timestamp, dir, path, record, idx} = obj;
        let targetSubdir = `${dir}/renumbered`;
        await ensureDir(targetSubdir); // asigură-te că există subdirectorul în care scrii
        await writeTheFile(path, `${targetSubdir}/${timestamp}_${idx}.tif`); // copiază și redenumește fișierul  
    }

    // Funcția care apelată va porni prelucrarea
    workOnpaths();
} catch (error) {
    console.error(error);
}
