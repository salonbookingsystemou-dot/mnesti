# Roadmap Ottimizzazione Mnesti
<!-- Il hook sessionStart legge questo file e inietta il primo task non completato come contesto. -->
<!-- Quando completi un task, cambia [ ] con [x]. Il giorno successivo il hook propone il prossimo. -->

## Sicurezza (priorità massima)

- [x] **[OPT-01] Rimuovere anthropic_api_key dal payload Supabase**
  - **File:** `app.html` — funzione `_syncToSupabase()` e `_loadFromSupabase()`
  - **Problema:** La chiave API Anthropic è salvata in `__apiKey` dentro `psico_state` e caricata su Supabase. Chiunque acceda alla colonna DB può leggerla.
  - **Fix:** Rimuovere `statePayload.__apiKey = apiKey` da `_syncToSupabase()`. Rimuovere il restore `localStorage.setItem('anthropic_api_key', remote.__apiKey)` da `_loadFromSupabase`. Il claude-proxy gestisce già l'auth lato server, la chiave non deve mai uscire dal client.
  - **Effort:** ~30 min

- [x] **[OPT-02] Rate limit fail-closed nel claude-proxy**
  - **File:** `supabase/functions/claude-proxy/index.ts`
  - **Problema:** Il try/catch del check rate limit fa `console.warn` e prosegue se il DB non risponde (fail-open). Un utente con DB degradato può fare chiamate illimitate.
  - **Fix:** Nel catch del rate limit check, restituire `Response({ error: 'Servizio temporaneamente non disponibile' }, { status: 503 })` invece di procedere con la chiamata Claude.
  - **Effort:** ~20 min

## Stato & Dati

- [x] **[OPT-03] Check dimensione localStorage in _safeLSSet()**
  - **File:** `app.html` — funzione `_safeLSSet()`
  - **Problema:** Con 5+ fonti PDF OCR (30.000 char cad.) + 30 giorni di domande, localStorage può saturarsi (~5-10 MB limite browser). Un `QuotaExceededError` silenzioso causa perdita dati.
  - **Fix:** Prima di ogni write stimare `Object.keys(localStorage).reduce((s,k) => s + (localStorage.getItem(k)||'').length, 0)`. Se > 4.5 MB mostrare un avviso con `_showToast` e suggerire di eliminare fonti obsolete. Non bloccare il save.
  - **Effort:** ~45 min

- [x] **[OPT-06] Central store con Proxy (saveState automatico)**
  - **File:** `app.html` — refactor del modello `state` + 19 chiamate a `saveState()`
  - **Problema:** 19 punti nel codice chiamano `saveState()` manualmente. Facile dimenticare un save su un nuovo path → dato perso silenziosamente.
  - **Fix:** Avvolgere `state` in un `Proxy` con trap `set` che chiama `_safeLSSet` + `_debouncedSync` automaticamente. Le 19 chiamate a `saveState()` esplicite rimangono come flush immediato dove necessario, ma il proxy garantisce che nessuna modifica vada persa.
  - **Effort:** ~2h

## Scalabilità & Costo API

- [x] **[OPT-04] Limitare existingBlock in generateQuestionsFromSource**
  - **File:** `app.html` — funzione `generateQuestionsFromSource()`
  - **Problema:** Tutte le domande esistenti vengono inviate al modello. Con 30+ domande il solo `existingBlock` supera 5.000 token (~$0.015/call extra).
  - **Fix:** `const existingBlock = allExisting.slice(-15)` — mandare solo le ultime 15 domande. Aggiungere in fondo al prompt: "Esistono in totale N domande; quelle più recenti sono mostrate sopra."
  - **Effort:** ~20 min

- [x] **[OPT-05] TimerRegistry per clearAll() su cambio giornata**
  - **File:** `app.html` — tutti i `setTimeout`/`setInterval` sparsi (69 occorrenze)
  - **Problema:** Timer multipli senza gestore centralizzato. Su cambio giornata o navigazione quelli vecchi rimangono attivi → memory leak + consumo batteria su mobile.
  - **Fix:** Creare `const TimerRegistry = { _map: new Map(), set(id,fn,ms){clearTimeout(this._map.get(id)); this._map.set(id, setTimeout(fn,ms));}, interval(id,fn,ms){...}, clear(id){...}, clearAll(){this._map.forEach(clearTimeout); this._map.clear();} }`. Migrare progressivamente i timer critici (inattività, debounce sync, progress pulse).
  - **Effort:** ~1.5h

## Performance

- [x] **[OPT-07] buildDays() dirty-flag: ricostruire solo la card modificata**
  - **File:** `app.html` — funzione `buildDays()` e i suoi 7 punti di chiamata
  - **Problema:** `buildDays()` fa `main.innerHTML = ''` e ricostruisce tutti i giorni. Con 30 giorni genera ~800 nodi DOM ogni interazione → jank su mobile.
  - **Fix:** Mantenere un `Map<dayId, HTMLElement>` delle card già create. Su modifica di un giorno, sostituire solo `container.replaceChild(newCard, oldCard)` invece di ricostruire tutto. `buildDays()` completo solo al primo render.
  - **Effort:** ~3h

## Architettura & Manutenibilità

- [x] **[OPT-08] Separare app.js e app.css da app.html**
  - **File:** `app.html` → `app.js` + `app.css` (nuovi file)
  - **Problema:** 638 KB in un file unico. Ogni diff mostra migliaia di righe. CSS e JS non possono essere cachati separatamente dal browser.
  - **Fix:** Estrarre il blocco `<style>` in `app.css` e il blocco `<script>` in `app.js`. In `app.html` rimane solo `<link rel="stylesheet" href="app.css">` e `<script src="app.js" defer>`. Aggiornare il Service Worker per cachare i tre file separatamente.
  - **Effort:** ~2h

- [x] **[OPT-09] Namespace delle 311 funzioni globali in moduli**
  - **File:** `app.html` (da fare dopo OPT-08)
  - **Problema:** 311 funzioni nello scope globale. Qualsiasi funzione può essere sovrascritta. Impossibile fare testing unitario.
  - **Fix:** Raggruppare in namespace object: `const MnestiSession = {...}`, `const MnestiSync = {...}`, `const MnestiAI = {...}`, `const MnestiUI = {...}`, `const MnestiTimer = {...}`. Fare un alias globale per retrocompatibilità dove necessario: `window.verifyAnswer = MnestiSession.verify`.
  - **Effort:** ~4h

- [ ] **[OPT-10] Sostituire template literals HTML con <template> + cloneNode**
  - **File:** `app.html` — funzione `buildDays()` e `_renderQsPanel()` (i due template più grandi)
  - **Problema:** 4.000+ char di HTML costruito con concatenazione stringhe JS. Nessun syntax highlight, nessun lint HTML, alto rischio XSS da interpolazione non escaped.
  - **Fix:** Aggiungere `<template id="day-card-tpl">` e `<template id="question-card-tpl">` nel HTML statico. In JS: `const tpl = document.getElementById('day-card-tpl').content.cloneNode(true)`. Popolare i campi con `querySelector` + `textContent`/`dataset`. Usare `escHtml()` esistente su tutti i valori utente.
  - **Effort:** ~3h
