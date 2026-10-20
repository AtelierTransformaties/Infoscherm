// Beheer vanaf de pc. Alles wat hier verandert, toont het TV-scherm meteen.
'use strict';

const $ = id => document.getElementById(id);
let inst = Infoscherm.laad();
let tvStatus = null;
const BEELD = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const WISSELTIJDEN = [[10000, '10 sec'], [20000, '20 sec'], [30000, '30 sec'], [60000, '1 min']];

function bewaar(wijziging) {
  inst = Infoscherm.bewaar(wijziging);
  render();
}

function maak(tag, klasse, tekst) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
}

let meldingTimer;
function melding(tekst, soort) {
  const m = $('melding');
  m.textContent = tekst;
  m.className = 'melding zicht' + (soort === 'fout' ? ' fout' : '');
  clearTimeout(meldingTimer);
  meldingTimer = setTimeout(() => m.classList.remove('zicht'), 3200);
}

// Knop die eerst om bevestiging vraagt, zonder browservenster.
function tweeStappen(knop, actie) {
  const tekst = knop.textContent;
  let gewapend = false, t;
  const reset = () => { gewapend = false; clearTimeout(t); knop.textContent = tekst; knop.classList.remove('gewapend'); };
  knop.addEventListener('click', () => {
    if (!gewapend) {
      gewapend = true;
      knop.textContent = 'Zeker? Klik nog eens';
      knop.classList.add('gewapend');
      t = setTimeout(reset, 4000);
      return;
    }
    reset();
    actie();
  });
}

// ---------- TV-status ----------
function tvVerbonden() {
  return tvStatus && Date.now() - tvStatus.tijd < 25000;
}

function toonTvStatus() {
  const pil = $('tvPil');
  if (tvVerbonden()) {
    pil.className = 'tv-pil ok';
    $('tvPilTekst').textContent = 'TV verbonden' + (tvStatus.fotos ? ` · foto ${tvStatus.foto}/${tvStatus.fotos}` : '');
  } else {
    pil.className = 'tv-pil';
    $('tvPilTekst').textContent = 'Geen TV-scherm open';
  }

  const z = Infoscherm.zender(inst.radio.zender);
  const naam = z ? z.naam : '';
  let klasse = '', tekst;
  if (!tvVerbonden()) {
    tekst = inst.radio.speelt ? `${naam} start zodra het TV-scherm open staat` : 'Radio staat uit';
  } else {
    const tz = Infoscherm.zender(tvStatus.zender);
    switch (tvStatus.radio) {
      case 'speelt': klasse = 'ok'; tekst = `Speelt op de TV: ${tz ? tz.naam : naam}`; break;
      case 'laden': klasse = 'bezig'; tekst = `TV maakt verbinding met ${tz ? tz.naam : naam}...`; break;
      case 'geblokkeerd': klasse = 'wacht'; tekst = 'De TV wacht op één klik op het scherm voor hij geluid mag geven'; break;
      case 'fout': klasse = 'fout'; tekst = 'Zender niet bereikbaar, de TV probeert opnieuw...'; break;
      default: tekst = inst.radio.speelt ? `${naam} wordt gestart...` : 'Radio staat uit';
    }
  }
  $('radioStatus').className = 'status ' + klasse;
  $('radioStatusTekst').textContent = tekst;
  markeerHuidigeFoto();
}

// ---------- radio ----------
function renderRadio() {
  const vak = $('zenders');
  if (!vak.children.length) {
    Infoscherm.ZENDERS.forEach(z => {
      const k = maak('button', 'zender');
      k.type = 'button';
      k.dataset.id = z.id;
      k.append(maak('b', '', z.kort), maak('span', '', z.naam));
      const eq = maak('span', 'eq');
      eq.innerHTML = '<i></i><i></i><i></i>';
      k.append(eq);
      k.addEventListener('click', () => bewaar({ radio: { ...inst.radio, zender: z.id, speelt: true } }));
      vak.append(k);
    });
  }
  [...vak.children].forEach(k => {
    const gekozen = k.dataset.id === inst.radio.zender;
    k.classList.toggle('gekozen', gekozen);
    k.classList.toggle('speelt', gekozen && inst.radio.speelt);
  });
  $('radioKnop').textContent = inst.radio.speelt ? '■ Stoppen' : '▶ Afspelen op TV';
  const vol = Math.round(inst.radio.volume * 100);
  if (document.activeElement !== $('volume')) $('volume').value = vol;
  $('volumeTekst').textContent = vol + '%';
}

$('radioKnop').addEventListener('click', () => bewaar({ radio: { ...inst.radio, speelt: !inst.radio.speelt } }));

let volumeTimer;
$('volume').addEventListener('input', e => {
  const v = Number(e.target.value);
  $('volumeTekst').textContent = v + '%';
  clearTimeout(volumeTimer);
  volumeTimer = setTimeout(() => bewaar({ radio: { ...inst.radio, volume: v / 100 } }), 120);
});

// ---------- levering ----------
function renderLevering() {
  $('leveringWeek').textContent = 'Week ' + Infoscherm.weekNummer(new Date());
  const vak = $('medewerkers');
  vak.innerHTML = '';
  const namen = inst.medewerkers || [];
  if (!namen.length) vak.append(maak('span', 'noot', 'Nog geen namen. Voeg er hieronder een toe.'));
  namen.forEach(naam => {
    const c = maak('div', 'naam-chip' + (naam === inst.levering ? ' gekozen' : ''));
    const kies = maak('button', 'chip-naam', naam);
    kies.type = 'button';
    kies.addEventListener('click', () => { bewaar({ levering: naam }); melding(`${naam} staat op de TV voor de levering`); });
    const weg = maak('button', 'chip-weg', '×');
    weg.type = 'button';
    weg.title = `${naam} uit de lijst halen`;
    weg.addEventListener('click', () => {
      bewaar({ medewerkers: (inst.medewerkers || []).filter(n => n !== naam) });
      melding(naam === inst.levering
        ? `${naam} uit de lijst gehaald. Hij blijft op de TV tot je een andere naam kiest.`
        : `${naam} uit de lijst gehaald`);
    });
    c.append(kies, weg);
    vak.append(c);
  });
}

function naamToevoegen() {
  const naam = $('nieuweNaam').value.trim().replace(/\s+/g, ' ');
  if (!naam) return;
  const namen = inst.medewerkers || [];
  if (namen.some(n => n.toLowerCase() === naam.toLowerCase())) { melding(`${naam} staat al in de lijst`, 'fout'); return; }
  bewaar({ medewerkers: [...namen, naam] });
  $('nieuweNaam').value = '';
  melding(`${naam} toegevoegd`);
}
$('naamToevoegen').addEventListener('click', naamToevoegen);
$('nieuweNaam').addEventListener('keydown', e => { if (e.key === 'Enter') naamToevoegen(); });

// ---------- foto's ----------
const duimUrls = new Map();
let fotoSleutel = null;

async function duimUrl(f) {
  if (f.url) return f.url;
  if (duimUrls.has(f.id)) return duimUrls.get(f.id);
  const blob = await Infoscherm.fotoHaal(f.id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  duimUrls.set(f.id, u);
  return u;
}

const BRON = { map: 'Teams', upload: 'Upload', link: 'Link', demo: 'Voorbeeld' };

function renderFotos() {
  const n = inst.fotos.length;
  $('fotoAantal').textContent = n === 1 ? '1 foto' : `${n} foto's`;
  const sleutel = inst.fotos.map(f => f.id).join('|');
  if (sleutel === fotoSleutel) return;
  fotoSleutel = sleutel;

  for (const [id, u] of duimUrls) {
    if (!inst.fotos.some(f => f.id === id)) { URL.revokeObjectURL(u); duimUrls.delete(id); }
  }

  const lijst = $('fotoLijst');
  lijst.innerHTML = '';
  if (!n) {
    lijst.append(maak('div', 'leeg-lijst', "Nog geen foto's. Koppel de Teams-map of sleep er een paar in het vak hierboven."));
    return;
  }
  inst.fotos.forEach(f => {
    const d = maak('div', 'duim');
    d.dataset.id = f.id;
    const img = new Image();
    img.alt = f.naam || '';
    img.loading = 'lazy';
    duimUrl(f).then(u => { if (u) img.src = u; });
    const weg = maak('button', 'weg', '×');
    weg.type = 'button';
    weg.title = f.bron === 'map' ? 'Verwijderen (komt terug zolang hij in de Teams-map staat)' : 'Verwijderen';
    weg.addEventListener('click', () => verwijderFoto(f.id));
    d.append(img, maak('span', 'bron ' + f.bron, BRON[f.bron] || f.bron), weg, maak('span', 'naam', f.naam || ''));
    lijst.append(d);
  });
  markeerHuidigeFoto();
}

function markeerHuidigeFoto() {
  const id = tvVerbonden() ? tvStatus.fotoId : null;
  [...$('fotoLijst').querySelectorAll('.duim')].forEach(d => d.classList.toggle('nu', d.dataset.id === id));
}

async function verwijderFoto(id) {
  const f = inst.fotos.find(x => x.id === id);
  bewaar({ fotos: inst.fotos.filter(x => x.id !== id) });
  if (f && f.opslag) await Infoscherm.fotoWis(id).catch(() => {});
}

// Foto bewaren: demo in deze browser, online in Supabase (dan krijgt ze een openbare link).
async function slaFotoOp(bestand, bron, naam, extra) {
  const id = nieuwId();
  const url = await Infoscherm.fotoZet(id, await verklein(bestand));
  const f = { id, bron, naam, opslag: true, ...extra };
  if (url) f.url = url;
  return f;
}

function nieuwId() {
  return 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function beeldVan(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { return await createImageBitmap(file); }
}

// Foto's op TV-formaat brengen: scherp genoeg voor 1080p, en veel kleiner dan een gsm-foto.
async function verklein(file) {
  const bmp = await beeldVan(file);
  const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.type === 'image/jpeg' && file.size < 1000000) { bmp.close(); return file; }
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d');
  g.fillStyle = '#0a1424';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return await new Promise((ok, nok) => c.toBlob(b => (b ? ok(b) : nok(new Error('omzetten mislukt'))), 'image/jpeg', 0.86));
}

async function voegBestandenToe(bestanden) {
  const beelden = [...bestanden].filter(f => f.type.startsWith('image/') || BEELD.test(f.name));
  if (!beelden.length) return;
  const nieuw = [];
  let mislukt = 0;
  for (const [i, f] of beelden.entries()) {
    melding(`Foto's verwerken: ${i + 1} / ${beelden.length}`);
    try {
      nieuw.push(await slaFotoOp(f, 'upload', f.name));
    } catch (e) { mislukt++; }
  }
  inst = Infoscherm.laad();
  bewaar({ fotos: [...inst.fotos, ...nieuw] });
  melding(`${nieuw.length} foto${nieuw.length === 1 ? '' : "'s"} toegevoegd` + (mislukt ? `, ${mislukt} niet leesbaar` : ''), mislukt ? 'fout' : '');
}

$('fotoInvoer').addEventListener('change', e => { voegBestandenToe(e.target.files); e.target.value = ''; });

const vak = $('sleepVak');
['dragenter', 'dragover'].forEach(t => vak.addEventListener(t, e => { e.preventDefault(); vak.classList.add('erboven'); }));
['dragleave', 'drop'].forEach(t => vak.addEventListener(t, () => vak.classList.remove('erboven')));
vak.addEventListener('drop', e => { e.preventDefault(); voegBestandenToe(e.dataTransfer.files); });

function urlToevoegen() {
  const v = $('fotoUrl').value.trim();
  if (!/^https?:\/\/\S+$/i.test(v)) { melding('Dat is geen geldige link (begint met https://)', 'fout'); return; }
  const naam = decodeURIComponent(v.split('?')[0].split('/').pop() || 'afbeelding');
  bewaar({ fotos: [...inst.fotos, { id: nieuwId(), bron: 'link', naam, url: v }] });
  $('fotoUrl').value = '';
  melding('Link toegevoegd');
}
$('urlToevoegen').addEventListener('click', urlToevoegen);
$('fotoUrl').addEventListener('keydown', e => { if (e.key === 'Enter') urlToevoegen(); });

tweeStappen($('fotosWissen'), async () => {
  bewaar({ fotos: [] });
  await Infoscherm.fotosLeeg().catch(() => {});
  melding("Alle foto's verwijderd");
});

// ---------- Teams-map ----------
// De map uit Teams staat via "Synchroniseren" in de Verkenner. Edge en Chrome kunnen
// zo'n map onthouden en later opnieuw lezen; andere browsers kiezen ze telkens opnieuw.
const kanMapOnthouden = 'showDirectoryPicker' in window;
let mapHandle = null;
let bezigMetMap = false;

function toonMap() {
  const m = inst.map;
  if (m) {
    const tijd = new Date(m.tijd).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    $('mapStatus').textContent = `Gekoppeld: ${m.naam} · ${m.aantal} foto${m.aantal === 1 ? '' : "'s"} · bijgewerkt ${tijd}`;
  } else {
    $('mapStatus').textContent = 'Nog geen map gekoppeld.';
  }
  $('mapKoppel').textContent = m ? 'Andere map' : 'Map koppelen';
  $('mapKoppel').classList.toggle('primair', !m);
  $('mapSync').classList.toggle('verborgen', !m);
}

async function verwerkMap(bestanden, mapNaam) {
  if (bezigMetMap) return;
  bezigMetMap = true;
  try {
    const beelden = bestanden
      .filter(b => BEELD.test(b.naam))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl', { numeric: true }));
    inst = Infoscherm.laad();
    const oud = inst.fotos.filter(f => f.bron === 'map');
    const opSleutel = new Map(oud.map(f => [f.sleutel, f]));
    const nieuw = [];
    let toegevoegd = 0, mislukt = 0;

    for (const [i, b] of beelden.entries()) {
      const sleutel = `${b.naam}|${b.file.size}|${b.file.lastModified}`;
      let f = opSleutel.get(sleutel);
      if (!f) {
        $('mapStatus').textContent = `Bezig: ${i + 1} / ${beelden.length}`;
        try {
          f = await slaFotoOp(b.file, 'map', b.naam.split('/').pop(), { sleutel });
          toegevoegd++;
        } catch (e) { mislukt++; continue; }
      }
      nieuw.push(f);
    }

    const weg = oud.filter(f => !nieuw.includes(f));
    for (const f of weg) await Infoscherm.fotoWis(f.id).catch(() => {});

    inst = Infoscherm.laad();
    bewaar({
      fotos: [...nieuw, ...inst.fotos.filter(f => f.bron !== 'map')],
      map: { naam: mapNaam, aantal: nieuw.length, tijd: Date.now() }
    });
    if (toegevoegd || weg.length || mislukt) {
      melding(`Teams-map: ${toegevoegd} nieuw, ${weg.length} weg` + (mislukt ? `, ${mislukt} niet leesbaar` : ''), mislukt ? 'fout' : '');
    } else {
      melding('Teams-map: niets veranderd');
    }
  } finally {
    bezigMetMap = false;
    toonMap();
  }
}

async function leesMap() {
  const bestanden = [];
  for await (const [naam, item] of mapHandle.entries()) {
    if (item.kind === 'file' && BEELD.test(naam)) bestanden.push({ naam, file: await item.getFile() });
  }
  await verwerkMap(bestanden, mapHandle.name);
}

async function magLezen(vragen) {
  if (!mapHandle) return false;
  try {
    if (await mapHandle.queryPermission({ mode: 'read' }) === 'granted') return true;
    return vragen && await mapHandle.requestPermission({ mode: 'read' }) === 'granted';
  } catch (e) { return false; }
}

$('mapKoppel').addEventListener('click', async () => {
  if (!kanMapOnthouden) { $('mapInvoer').click(); return; }
  try {
    mapHandle = await window.showDirectoryPicker({ id: 'infoscherm', mode: 'read' });
  } catch (e) {
    if (e.name !== 'AbortError') melding('Map kiezen lukte niet: ' + e.message, 'fout');
    return;
  }
  await Infoscherm.diversenZet('map', mapHandle).catch(() => {});
  await leesMap();
});

$('mapSync').addEventListener('click', async () => {
  if (!kanMapOnthouden || !mapHandle) { $('mapInvoer').click(); return; }
  if (!(await magLezen(true))) { melding('Geen toegang tot de map gekregen', 'fout'); return; }
  await leesMap();
});

$('mapInvoer').addEventListener('change', e => {
  const files = [...e.target.files];
  const mapNaam = files.length && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'map';
  verwerkMap(files.map(f => ({ naam: f.webkitRelativePath || f.name, file: f })), mapNaam);
  e.target.value = '';
});

async function startMap() {
  if (kanMapOnthouden) {
    try { mapHandle = (await Infoscherm.diversenHaal('map')) || null; } catch (e) { mapHandle = null; }
  }
  setInterval(async () => { if (await magLezen(false)) leesMap(); }, 5 * 60 * 1000);
}

// ---------- weergave en contacten ----------
function renderWeergave() {
  const vak = $('wisseltijden');
  vak.innerHTML = '';
  WISSELTIJDEN.forEach(([ms, label]) => {
    const c = maak('button', 'chip' + (ms === inst.wisseltijd ? ' gekozen' : ''), label);
    c.type = 'button';
    c.addEventListener('click', () => bewaar({ wisseltijd: ms }));
    vak.append(c);
  });
}

let contactTimer;
const MAX_CONTACTEN = 4;
function renderContacten() {
  const vak = $('contacten');
  // niet opnieuw opbouwen terwijl iemand in een veld typt
  if (vak.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  vak.innerHTML = '';
  inst.contacten.forEach((c, i) => {
    const rij = maak('div', 'contact-rij');
    const naam = maak('input');
    naam.value = c.naam;
    naam.placeholder = 'Naam';
    const tel = maak('input');
    tel.value = c.tel;
    tel.placeholder = 'Telefoon';
    [naam, tel].forEach(v => v.addEventListener('input', () => {
      clearTimeout(contactTimer);
      contactTimer = setTimeout(() => {
        const lijst = inst.contacten.map(x => ({ ...x }));
        lijst[i] = { naam: naam.value, tel: tel.value };
        bewaar({ contacten: lijst });
      }, 400);
    }));
    const weg = maak('button', 'knop weg-knop', '×');
    weg.type = 'button';
    weg.title = 'Verwijderen';
    weg.addEventListener('click', () => {
      clearTimeout(contactTimer);
      document.activeElement.blur(); // anders slaat renderContacten het opnieuw opbouwen over
      bewaar({ contacten: inst.contacten.filter((_, j) => j !== i) });
    });
    rij.append(naam, tel, weg);
    vak.append(rij);
  });

  const plus = maak('button', 'knop contact-plus', '+ Verantwoordelijke toevoegen');
  plus.type = 'button';
  plus.disabled = inst.contacten.length >= MAX_CONTACTEN;
  plus.title = plus.disabled ? `Er passen er maximaal ${MAX_CONTACTEN} op de TV` : '';
  plus.addEventListener('click', () => {
    clearTimeout(contactTimer);
    document.activeElement.blur();
    bewaar({ contacten: [...inst.contacten, { naam: '', tel: '' }] });
    const velden = vak.querySelectorAll('.contact-rij input');
    if (velden.length >= 2) velden[velden.length - 2].focus();
  });
  vak.append(plus);
}

tweeStappen($('herstel'), async () => {
  inst = Infoscherm.herstel();
  await Infoscherm.fotosLeeg().catch(() => {});
  await Infoscherm.diversenWis('map').catch(() => {});
  mapHandle = null;
  fotoSleutel = null;
  render();
  melding('Standaardinstellingen hersteld');
});

// ---------- alles ----------
function render() {
  renderRadio();
  renderLevering();
  renderFotos();
  renderWeergave();
  renderContacten();
  toonMap();
  toonTvStatus();
}

Infoscherm.luister(b => {
  if (b.soort === 'tv-status') { tvStatus = b; toonTvStatus(); }
  else if (b.soort === 'instellingen') { inst = Infoscherm.laad(); render(); }
  else if (b.soort === 'verbonden') Infoscherm.zend({ soort: 'vraag-status' });
});
Infoscherm.opFout(tekst => melding(tekst, 'fout'));

// ---------- opstarten en aanmelden ----------
function vraagStatus() { Infoscherm.zend({ soort: 'vraag-status' }); }

function klaar() {
  $('aanmelden').classList.add('verborgen');
  inst = Infoscherm.laad();
  render();
  startMap();
  vraagStatus();
  setInterval(vraagStatus, 30000);
  setInterval(toonTvStatus, 2000);
}

$('aanmeldForm').addEventListener('submit', async e => {
  e.preventDefault();
  const knop = $('aanmeldKnop');
  knop.disabled = true;
  $('aanmeldFout').textContent = '';
  try {
    await Infoscherm.meldAan($('aanmeldMail').value.trim(), $('aanmeldWachtwoord').value);
    $('aanmeldWachtwoord').value = '';
    klaar();
  } catch (fout) {
    $('aanmeldFout').textContent = /invalid/i.test(fout.message || '') ? 'E-mail of wachtwoord klopt niet.' : 'Aanmelden lukte niet: ' + (fout.message || fout);
  } finally {
    knop.disabled = false;
  }
});

$('afmelden').addEventListener('click', async () => {
  await Infoscherm.meldAf();
  location.reload();
});

$('teamsLink').href = Infoscherm.TEAMS_MAP;
$('stand').textContent = Infoscherm.ONLINE ? 'Online' : 'Demo';
$('stand').classList.add(Infoscherm.ONLINE ? 'online' : 'demo');
$('demoUitleg').classList.toggle('verborgen', Infoscherm.ONLINE);
$('afmelden').classList.toggle('verborgen', !Infoscherm.ONLINE);

(async () => {
  render();
  // Online: niets laten aanklikken tot vaststaat of er iemand aangemeld is.
  const knop = $('aanmeldKnop');
  if (Infoscherm.ONLINE) {
    $('aanmelden').classList.remove('verborgen');
    knop.disabled = true;
    knop.textContent = 'Verbinden...';
  }
  await Infoscherm.start();
  const ok = await Infoscherm.aangemeld().catch(() => false);
  knop.disabled = false;
  knop.textContent = 'Aanmelden';
  if (ok) klaar();
  else { $('aanmelden').classList.remove('verborgen'); $('aanmeldMail').focus(); }
})();
