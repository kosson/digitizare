/*
* Renumber - aplicație care renumerotează fișierele create de CopyBook cu nume în ordinea în care au fost create fișierele la momentul scanării
* version 0.1
* November 2022
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
     */
    async function writeTheFile (source, destination) {
        let fexists = await fs.access(source, constants.F_OK);
        // console.log(fexists);
        if (fexists === undefined) {
            await fs.copyFile( source, destination);
        };
    }
 
    let xobject = new Set(); // tructura care acumulează înregistrările din care se creează array-ul

    /**
     * Este o funcție recursivă care are rolul de a prelucra obiectul ce reprezintă structura fișierului .mets
     * Toate proprietățile au drept valoare un array indiferent de datele care sunt acolo. Această structură o generează `xml2js`
     * @param {Object} obj 
     */
    async function revealHref (obj, state = {log: '', mapa: {}}) {

        // Prelucrează array-urile care sunt valorile cheilor
        if (Array.isArray(obj)) {
            let elem;
            for (elem of obj) {
                revealHref(elem, state);
            }
        }

        // cazul array de `fileGrp` a lui `fileSec` care are array-uri de `fileGrp` la rândul său
        if (obj['mets:fileGrp'] != null) {
            // console.log(`obj['mets:fileGrp'] este `, elem);
            // dacă elementul conține un array, apelează recursiv
            if (Array.isArray(obj['mets:fileGrp'])) {
                revealHref(obj['mets:fileGrp'], state);
            }
        }
        
        if (obj['mets:file'] != null) {
            // console.log(`Detaliile despre fișier `, JSON.stringify(obj['mets:file']));
            // revealHref(obj['mets:file'], state);
            // console.log(`Structura de prelucrare este `, obj['mets:file']);
            for (let record of obj['mets:file']) {
                xobject.add(record);
            }
        }

        if (obj['CREATED'] != null) {
            state['created'] = obj['CREATED'][0];             
        }

        if (obj['mets:FLocat'] != null) {
            revealHref(obj['mets:FLocat'], state);
            // console.log(`Obiectul FLocat ar fi `, obj['mets:FLocat']);
        }

        return state;
    };

    /**
     * Funcția extrage căile directoarelor și apelează `fileNameExtractor()` pe fiecare
     */
    async function workOnpaths () {
        let paths = await globby(['./DOCS/**/*.mets']);
        paths.map(fileNameExtractor);
    };
    
    /**
     * Funcția va prelucra fișierul cu extensia .mets din calea pasată
     * @param {String} path 
     */
    async function fileNameExtractor (path) {  
        const xml = await fs.readFile(path);
        let result = await xml2js.parseStringPromise(xml, { mergeAttrs: true });
        console.log(`Calea prelucrată este `, path);
        // console.log(`fileSec este `, result['mets:mets']['mets:fileSec']);
        if (result['mets:mets']['mets:fileSec']) {
            await revealHref(result['mets:mets']['mets:fileSec'], {n:0}); // extrage obiectul tip Set care să intre în prelucrare
            // console.log(`Structura mare pe care o am este `, xobject);
            let xarry = Array.from(xobject);

            // sortează după timestamp
            xarry.sort((obj1, obj2) => {
                return new Date(obj1.CREATED).valueOf() - new Date(obj2.CREATED).valueOf();
            });
            // console.log(`Xarry este `, xarry);

            xarry.forEach(processRecord);
        } else {
            throw new Error('File Sequence nu este găsit');
        }

    }

    async function processRecord (record, idx, arr) {
        let pathSegments = record['mets:FLocat'][0]['xlink:href'][0].split("\\");
        let nixPathRoot = `${pathSegments[0]}/DOCS/${pathSegments[1]}`;
        let targetSubdir = `${nixPathRoot}/renumbered`;
        // let obx = {no: idx, timestamp: new Date(record.CREATED[0]).valueOf(), created: record.CREATED[0], filename: pathSegments[2]};               
        await ensureDir(targetSubdir); // asigură-te că există subdirectorul în care scrii
        // console.log(`${nixPathRoot}/${pathSegments[2]}`, `${targetSubdir}/${new Date(record.CREATED[0]).valueOf()}_${idx}.tif`);

        await writeTheFile(`${nixPathRoot}/${pathSegments[2]}`, `${targetSubdir}/${new Date(record.CREATED[0]).valueOf()}_${idx}.tif`); // procesează fișierul    
        // writeTheFile(`${nixPathRoot}/${pathSegments[2]}`, `${targetSubdir}/${obx['timestamp'].tif}`); // procesează fișierul  
    }
    
    // Funcția care apelată va porni prelucrarea
    workOnpaths();
} catch (error) {
    console.error(error);
}
