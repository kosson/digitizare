# Renumber

Acest script este folosit pentru a renumerota fișierele create de software-ul echipamentului de digitizare. Software-ul redenumește fișierele create pentru a crea o ordine ce respectă timestamp-ul obținut din data creării așa cum este aceasta înregistrată în fișierul .mets. 

Pentru a lucra cu script-ul ai nevoie de Node.js versiunea 18.x.x. Trebuie să instalezi pachetele cu `npm install` și apoi să te asiguri că ai pus directoarele cu imagini rezultate în urma scanării folosind CopyBook într-un subdirector `DOCS` aflat în rădăcina proiectului. Odată ce ai pus subdirectoarele în DOCS, rulează scriptul cu `node app.js`.

În urma rulării obții câte un subdirector în fiecare director cu imagini care se numește `renumbered`. Acesta va conține setul de imagini redenumite cu timestamp-ul urmat de un underscore și un număr natural în ordinea de prelucrare.