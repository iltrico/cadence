// Interface language, picked from the system settings.
// To add a language, add a block to STRINGS with the same keys.
// Plans, history and exports keep their data in English; only what's shown is translated.

const STRINGS = {
  en: {
    history: 'History', session: 'Session', length: 'Length', setLengthBy: 'Set length by',
    time: 'Time', distance: 'Distance', shorter: 'Shorter', longer: 'Longer',
    minutes: 'minutes', meters: 'meters', split: '500m split', showPlan: 'Show plan',
    start: 'Start {time}', plan: 'Plan', close: 'Close', timeLeft: 'Time left in interval',
    nextUp: 'Next up', totalLeft: 'Total left', elapsed: 'Elapsed', then: 'Then',
    pause: 'Pause', resume: 'Resume', skip: 'Skip', end: 'End', paused: 'Paused',
    endQuestion: 'End this session?', endYes: 'End session', keepRowing: 'Keep rowing',
    done: 'Session done', rowed: 'Rowed', intervals: 'Intervals', hardWork: 'Hard work',
    exportCsv: 'Export CSV', spm: 'spm', stroke: 'stroke', strokes: 'strokes',
    nextRate: '{spm} spm for {time}', lastStrokes: 'Last strokes, empty the tank', finish: 'Finish',
    bestFrom: 'Best from {n} min', of: '{a} of {b}',
    historyOne: '1 session, {time} rowed', historyMany: '{n} sessions, {time} rowed',
    noSessions: 'No sessions yet', endedEarly: 'ended early', delete: 'Delete', deleteSession: 'Delete session',
    'stage.armsOnly': 'Arms only', 'stage.armsBody': 'Arms and body', 'stage.halfSlide': 'Half slide', 'stage.fullSlide': 'Full slide',
    'word.pick': 'Pick drill', 'word.easy': 'Easy', 'word.build': 'Build', 'word.firm': 'Firm strokes',
    'word.steady': 'Steady', 'word.tempo': 'Tempo', 'word.threshold': 'Threshold', 'word.race': 'Race pace',
    'word.sprint': 'Sprint', 'word.rung': 'Rung', 'word.recover': 'Recover', 'word.cool': 'Cool-down',
    'type.steady': 'Steady state', 'desc.steady': 'Long, easy aerobic base.',
    'type.tempo': 'Tempo', 'desc.tempo': 'Sustained and comfortably hard.',
    'type.threshold': 'Threshold', 'desc.threshold': 'Long reps just under race effort.',
    'type.vo2': '2k pace', 'desc.vo2': 'Race-rhythm reps with equal rest.',
    'type.power': 'Power sprints', 'desc.power': 'Short bursts with full recovery.',
    'type.pyramid': 'Pyramid', 'desc.pyramid': 'Pieces build up, then step down.',
    'type.ladder': 'Rate ladder', 'desc.ladder': 'Same pressure, two strokes up each rung.',
    'type.recovery': 'Recovery', 'desc.recovery': 'Light paddle to flush the legs.',
  },
  fr: {
    history: 'Historique', session: 'Séance', length: 'Durée', setLengthBy: 'Définir la durée par',
    time: 'Temps', distance: 'Distance', shorter: 'Plus court', longer: 'Plus long',
    minutes: 'minutes', meters: 'mètres', split: 'Temps au 500 m', showPlan: 'Voir le programme',
    start: 'Démarrer {time}', plan: 'Programme', close: 'Fermer', timeLeft: "Temps restant dans l'intervalle",
    nextUp: 'Ensuite', totalLeft: 'Restant', elapsed: 'Écoulé', then: 'Puis',
    pause: 'Pause', resume: 'Reprendre', skip: 'Passer', end: 'Terminer', paused: 'En pause',
    endQuestion: 'Terminer la séance ?', endYes: 'Terminer', keepRowing: 'Continuer à ramer',
    done: 'Séance terminée', rowed: 'Ramé', intervals: 'Intervalles', hardWork: 'Travail intense',
    exportCsv: 'Exporter en CSV', spm: 'c/min', stroke: 'coup', strokes: 'coups',
    nextRate: '{spm} c/min pendant {time}', lastStrokes: 'Derniers coups, on vide le réservoir', finish: 'Fin',
    bestFrom: 'Idéal dès {n} min', of: '{a} sur {b}',
    historyOne: '1 séance, {time} ramé', historyMany: '{n} séances, {time} ramé',
    noSessions: 'Aucune séance pour le moment', endedEarly: 'interrompue', delete: 'Supprimer', deleteSession: 'Supprimer la séance',
    'stage.armsOnly': 'Bras seuls', 'stage.armsBody': 'Bras-corps', 'stage.halfSlide': 'Demi-coulisse', 'stage.fullSlide': 'Longueur',
    'word.pick': 'Éducatifs', 'word.easy': 'Souple', 'word.build': 'Progressif', 'word.firm': 'Coups appuyés',
    'word.steady': 'Endurance', 'word.tempo': 'Tempo', 'word.threshold': 'Seuil', 'word.race': 'Allure course',
    'word.sprint': 'Sprint', 'word.rung': 'Palier', 'word.recover': 'Récupération', 'word.cool': 'Retour au calme',
    'type.steady': 'Endurance fondamentale', 'desc.steady': 'Long et facile, la base aérobie.',
    'type.tempo': 'Tempo', 'desc.tempo': 'Soutenu, assez dur mais contrôlé.',
    'type.threshold': 'Seuil', 'desc.threshold': "Longues répétitions juste sous l'effort de course.",
    'type.vo2': 'Allure 2000', 'desc.vo2': 'Répétitions au rythme de course, récupération égale.',
    'type.power': 'Sprints de puissance', 'desc.power': 'Efforts courts, récupération complète.',
    'type.pyramid': 'Pyramide', 'desc.pyramid': 'Les efforts montent, puis redescendent.',
    'type.ladder': 'Paliers de cadence', 'desc.ladder': 'Même pression, deux coups de plus à chaque palier.',
    'type.recovery': 'Récupération active', 'desc.recovery': 'Rame légère pour délier les jambes.',
  },
  it: {
    history: 'Cronologia', session: 'Allenamento', length: 'Durata', setLengthBy: 'Imposta la durata per',
    time: 'Tempo', distance: 'Distanza', shorter: 'Più breve', longer: 'Più lungo',
    minutes: 'minuti', meters: 'metri', split: 'Passo sui 500 m', showPlan: 'Mostra il piano',
    start: 'Inizia {time}', plan: 'Piano', close: 'Chiudi', timeLeft: "Tempo rimasto nell'intervallo",
    nextUp: 'Prossimo', totalLeft: 'Rimanente', elapsed: 'Trascorso', then: 'Dopo',
    pause: 'Pausa', resume: 'Riprendi', skip: 'Salta', end: 'Fine', paused: 'In pausa',
    endQuestion: "Terminare l'allenamento?", endYes: 'Termina', keepRowing: 'Continua a remare',
    done: 'Sessione finita', rowed: 'Remato', intervals: 'Intervalli', hardWork: 'Lavoro intenso',
    exportCsv: 'Esporta CSV', spm: 'c/min', stroke: 'colpo', strokes: 'colpi',
    nextRate: '{spm} c/min per {time}', lastStrokes: 'Ultimi colpi, dai tutto', finish: 'Fine',
    bestFrom: 'Ideale da {n} min', of: '{a} di {b}',
    historyOne: '1 allenamento, {time} remati', historyMany: '{n} allenamenti, {time} remati',
    noSessions: 'Ancora nessun allenamento', endedEarly: 'interrotto', delete: 'Elimina', deleteSession: 'Elimina allenamento',
    'stage.armsOnly': 'Solo braccia', 'stage.armsBody': 'Braccia e busto', 'stage.halfSlide': 'Mezzo carrello', 'stage.fullSlide': 'Carrello intero',
    'word.pick': 'Esercizi tecnici', 'word.easy': 'Sciolto', 'word.build': 'Progressione', 'word.firm': 'Allunghi',
    'word.steady': 'Fondo lento', 'word.tempo': 'Fondo medio', 'word.threshold': 'Soglia', 'word.race': 'Passo gara',
    'word.sprint': 'Sprint', 'word.rung': 'Gradino', 'word.recover': 'Recupero', 'word.cool': 'Defaticamento',
    'type.steady': 'Fondo lento', 'desc.steady': 'Lungo e facile, base aerobica.',
    'type.tempo': 'Fondo medio', 'desc.tempo': 'Sostenuto e moderatamente duro.',
    'type.threshold': 'Soglia', 'desc.threshold': 'Ripetute lunghe appena sotto lo sforzo gara.',
    'type.vo2': 'Passo gara 2000', 'desc.vo2': 'Ripetute a ritmo gara con recupero uguale.',
    'type.power': 'Sprint di potenza', 'desc.power': 'Brevi scatti con recupero completo.',
    'type.pyramid': 'Piramide', 'desc.pyramid': 'Le ripetute salgono, poi scendono.',
    'type.ladder': 'Scala di ritmo', 'desc.ladder': 'Stessa pressione, due colpi in più a ogni gradino.',
    'type.recovery': 'Rigenerante', 'desc.recovery': 'Remata leggera per sciogliere le gambe.',
  },
};

// First system language we support, else English.
export const LANG = (navigator.languages || [navigator.language || 'en'])
  .map((l) => String(l).toLowerCase().split('-')[0])
  .find((l) => STRINGS[l]) || 'en';
// Locale for dates and numbers: the system's own variant of that language, if it's valid.
const validLocale = (l) => { try { return Intl.getCanonicalLocales(String(l).split('@')[0])[0]; } catch { return null; } };
export const LOCALE = (navigator.languages || [navigator.language || 'en'])
  .filter((l) => String(l).toLowerCase().startsWith(LANG))
  .map(validLocale).find(Boolean) || LANG;

export function t(key, vars = {}) {
  const s = STRINGS[LANG][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// Static text in the page: data-i18n sets the text, data-i18n-aria the accessible name.
export function translatePage(root = document) {
  document.documentElement.lang = LANG;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
