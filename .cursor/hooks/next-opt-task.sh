#!/bin/bash
# Hook sessionStart — inietta il prossimo task di ottimizzazione come contesto.
# Legge .cursor/optimization-roadmap.md e trova il primo task non completato (- [ ]).

ROADMAP=".cursor/optimization-roadmap.md"

if [ ! -f "$ROADMAP" ]; then
  echo '{}'
  exit 0
fi

# Trova il numero del prossimo task aperto
NEXT_TASK=$(grep -n "^- \[ \]" "$ROADMAP" | head -1)

if [ -z "$NEXT_TASK" ]; then
  # Tutti i task completati
  python3 -c "
import json
msg = {
  'additional_context': '## Roadmap ottimizzazione: COMPLETATA\nTutti i 10 task di ottimizzazione sono stati completati. Ottimo lavoro!'
}
print(json.dumps(msg))
"
  exit 0
fi

# Estrae il numero di riga e il titolo
LINE_NUM=$(echo "$NEXT_TASK" | cut -d: -f1)

# Estrae il blocco del task (titolo + righe indentate successive)
TASK_BLOCK=$(awk "NR==$LINE_NUM, /^- \[/ && NR>$LINE_NUM {if(NR>$LINE_NUM && /^- \[/) exit; print}" "$ROADMAP" | head -20)

# Conta i task totali e completati
TOTAL=$(grep -c "^- \[" "$ROADMAP")
DONE=$(grep -c "^- \[x\]" "$ROADMAP")
REMAINING=$((TOTAL - DONE))

python3 -c "
import json, sys

task = '''$TASK_BLOCK'''
total = $TOTAL
done = $DONE
remaining = $REMAINING

context = f'''## Roadmap ottimizzazione — Prossimo task ({done}/{total} completati, {remaining} rimanenti)

{task}

---
Per implementarlo di' semplicemente: **\"implementa il prossimo task di ottimizzazione\"**
Quando finisci, segna il task come completato nel file \`.cursor/optimization-roadmap.md\` cambiando \`- [ ]\` in \`- [x]\`.
'''

print(json.dumps({'additional_context': context}))
"
exit 0
