// validate.js — Βασικός έλεγχος υγείας πριν το deploy. Τρέχει αυτόματα στο GitHub Actions,
// ΠΡΙΝ επιτραπεί το deploy στο Firebase Hosting. Αν κάτι αποτύχει, το deploy ΔΕΝ προχωράει.
const fs = require('fs');
const { execSync } = require('child_process');

let hasError = false;
function fail(msg){ console.error('❌ ' + msg); hasError = true; }
function pass(msg){ console.log('✅ ' + msg); }

// 1. Ύπαρξη βασικών αρχείων
['index.html', 'sw.js', 'firebase.json', 'version.json'].forEach(f => {
  if(!fs.existsSync(f)) fail(`Λείπει το αρχείο: ${f}`);
  else pass(`Υπάρχει: ${f}`);
});
if(hasError){
  console.error('\nΣταματάει εδώ — λείπουν βασικά αρχεία.');
  process.exit(1);
}

// 2. Έγκυρο JSON στα ρυθμιστικά αρχεία
['firebase.json', 'version.json'].forEach(f => {
  try{ JSON.parse(fs.readFileSync(f, 'utf-8')); pass(`Έγκυρο JSON: ${f}`); }
  catch(e){ fail(`Μη έγκυρο JSON στο ${f}: ${e.message}`); }
});

// 3. index.html: εξαγωγή και έλεγχος συντακτικού του κύριου JavaScript
const html = fs.readFileSync('index.html', 'utf-8');
const scripts = [...html.matchAll(/<script(?: src="[^"]*")?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appJs = scripts.reduce((a,b) => a.length > b.length ? a : b, '');
if(!appJs || appJs.length < 1000){
  fail('Δεν βρέθηκε το κύριο JavaScript block μέσα στο index.html — κάτι σοβαρό λείπει.');
} else {
  fs.writeFileSync('_validate_tmp.js', appJs);
  try{
    execSync('node --check _validate_tmp.js', {stdio: 'pipe'});
    pass('Το JavaScript της εφαρμογής είναι συντακτικά έγκυρο');
  }catch(e){
    fail('Συντακτικό σφάλμα στο JavaScript:\n' + e.stderr.toString());
  }
  fs.unlinkSync('_validate_tmp.js');
}

// 4. Ισορροπία <div>...</div>
const openDivs = (html.match(/<div/g) || []).length;
const closeDivs = (html.match(/<\/div>/g) || []).length;
if(openDivs !== closeDivs) fail(`Μη ισορροπημένα <div>: ${openDivs} ανοιχτά, ${closeDivs} κλειστά`);
else pass(`Ισορροπημένα <div> (${openDivs})`);

// 5. Κρίσιμα HTML στοιχεία που ΠΡΕΠΕΙ να υπάρχουν
const criticalIds = [
  'f-nm', 'f-add', 'f-from', 'f-to', 'f-date',
  'analytics-section', 'cmdk-overlay', 'cmdk-input',
  'update-banner', 'backup-reminder', 'sync-google-btn',
  'checklist-section', 'engines-section', 'area-map-container'
];
const missingIds = criticalIds.filter(id => !html.includes(`id="${id}"`));
if(missingIds.length) fail('Λείπουν κρίσιμα στοιχεία: ' + missingIds.join(', '));
else pass('Όλα τα κρίσιμα στοιχεία HTML υπάρχουν (' + criticalIds.length + ')');

// 6. Sanity: το κρίσιμο sync-safety fix (21/07) ΠΡΕΠΕΙ να παραμένει παρόν — προστασία από απώλεια δεδομένων
if(!html.includes('remoteTrips.length < localTrips.length')){
  fail('ΚΡΙΣΙΜΟ: λείπει το sync-safety fix που προστατεύει από απώλεια δεδομένων!');
} else {
  pass('Το sync-safety fix είναι παρόν');
}

console.log('\n' + (hasError ? '❌ Ο έλεγχος ΑΠΕΤΥΧΕ — το deploy ΔΕΝ θα προχωρήσει.' : '✅ Όλοι οι έλεγχοι πέρασαν — προχωράει το deploy.'));
process.exit(hasError ? 1 : 0);
