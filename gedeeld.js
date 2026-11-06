// Gedeeld door TV en beheer: instellingen, foto-opslag en het kanaal ertussen.
// Twee standen:
//  - demo:   instellingen.js leeg. TV en beheer werken samen binnen dezelfde browser.
//  - online: instellingen.js ingevuld. Alles loopt via Supabase, TV en pc mogen
//            elk een ander toestel zijn.
// Bewust zonder ?. en ?? zodat ook oudere TV-browsers het lezen.
// Zo'n oudere browser kan de Supabase-bibliotheek zelf niet lezen. Die krijgt de lichte
// weg: instellingen ophalen met fetch en berichten via een eigen websocket. Dat volstaat
// voor de TV; het beheer heeft een recente browser nodig.
'use strict';

var Infoscherm = (function () {
  var SLEUTEL = 'infoscherm.instellingen.v1';
  var LAATST = 'infoscherm.laatst-online.v1';
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
  var EMMER = 'fotos';
  var KANAAL = 'infoscherm';

  var CONFIG = window.INFOSCHERM_CONFIG || {};
  var ONLINE = !!(CONFIG.supabaseUrl && CONFIG.supabaseSleutel);
  function kanNieuweCode() {
    try { new Function('var a = {}; return a?.b ?? 1;'); return true; } catch (e) { return false; }
  }
  var LICHT = ONLINE && (CONFIG.licht === true || !kanNieuweCode());

  var ZENDERS = [
    { id: 'stubru', naam: 'Studio Brussel', kort: 'StuBru', url: 'https://icecast.vrtcdn.be/stubru-high.mp3' },
    { id: 'mnm', naam: 'MNM', kort: 'MNM', url: 'https://icecast.vrtcdn.be/mnm-high.mp3' },
    { id: 'radio2', naam: 'Radio 2 Vlaams-Brabant', kort: 'Radio 2', url: 'https://icecast.vrtcdn.be/ra2vlb-high.mp3' },
    { id: 'radio1', naam: 'Radio 1', kort: 'Radio 1', url: 'https://icecast.vrtcdn.be/radio1-high.mp3' },
    { id: 'qmusic', naam: 'Qmusic', kort: 'Qmusic', url: 'https://icecast-qmusicbe-cdp.triple-it.nl/qmusic.mp3' },
    { id: 'joe', naam: 'Joe', kort: 'Joe', url: 'https://icecast-qmusicbe-cdp.triple-it.nl/joe.mp3' }
  ];

  var MEDEWERKERS = ['Johan', 'Benjamin', 'Geert', 'Ayman', 'Gianni', 'Dylan', 'Jef'];

  var WEER = { plaats: 'Kortenberg', lat: 50.88, lon: 4.54 };

  var TEAMS_MAP = 'https://teams.microsoft.com/l/channel/19%3AlcEXIMNuUfLt24tWUrb01PBgXrYP41oS8g-ufjNVxyo1%40thread.tacv2/Infoscherm?groupId=f559a539-bc06-49de-9767-7fd25a029b94&tenantId=aa827651-b9cd-4396-bf96-1f28c2a280bc&ngc=true';

  function standaard() {
    return {
      levering: 'Johan',
      medewerkers: MEDEWERKERS.slice(),
      wisseltijd: 30000,
      radio: { zender: 'stubru', speelt: false, volume: 0.7 },
      fotos: [
        { id: 'demo-1', bron: 'demo', naam: 'vw-busjes.jpg', url: 'fotos/vw-busjes.jpg' },
        { id: 'demo-2', bron: 'demo', naam: 'vw-bus-blauw.jpg', url: 'fotos/vw-bus-blauw.jpg' },
        { id: 'demo-3', bron: 'demo', naam: 'continental.jpg', url: 'fotos/continental.jpg' },
        { id: 'demo-4', bron: 'demo', naam: 'jaguars.jpg', url: 'fotos/jaguars.jpg' },
        { id: 'demo-5', bron: 'demo', naam: 'defender.jpg', url: 'fotos/defender.jpg' }
      ],
      contacten: [
        { naam: 'Philippe Van Deun', tel: '0496 •• •• 70' },
        { naam: 'Kristof Claesen', tel: '0479 •• •• 87' },
        { naam: 'Claudiu Pintilescu', tel: '0479 •• •• 24' }
      ],
      map: null,
      bijgewerkt: Date.now()
    };
  }

  function samenvoegen(opgeslagen) {
    var uit = Object.assign(standaard(), opgeslagen || {});
    uit.radio = Object.assign(standaard().radio, (opgeslagen && opgeslagen.radio) || {});
    return uit;
  }

  function leesLokaal(sleutel) {
    try { return JSON.parse(localStorage.getItem(sleutel)); } catch (e) { return null; }
  }

  var cache = samenvoegen(ONLINE ? leesLokaal(LAATST) : leesLokaal(SLEUTEL));
  var luisteraars = [];
  var lokaleLuisteraars = [];
  var foutLuisteraars = [];

  function meldFout(tekst, fout) {
    var bericht = tekst + (fout && fout.message ? ' (' + fout.message + ')' : '');
    foutLuisteraars.forEach(function (cb) { cb(bericht); });
  }

  // --- kanaal binnen deze browser (altijd), en in demostand ook tussen TV en beheer ---
  var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('infoscherm') : null;

  function verdeel(b) {
    if (b.soort === 'instellingen') {
      if (b.data) cache = samenvoegen(b.data);
      else if (!ONLINE) cache = samenvoegen(leesLokaal(SLEUTEL));
      if (ONLINE && b.data) bewaarLaatst(b.data);
    }
    luisteraars.forEach(function (cb) { cb(b); });
  }

  if (bc) {
    bc.onmessage = function (e) {
      var b = e.data || {};
      if (b.lokaal) lokaleLuisteraars.forEach(function (cb) { cb(b); });
      else if (!ONLINE) verdeel(b);
    };
  } else if (!ONLINE) {
    window.addEventListener('storage', function (e) {
      if (e.key === SLEUTEL) verdeel({ soort: 'instellingen' });
    });
  }

  // --- Supabase ---
  var sb = null, kanaal = null, gestart = null;

  function bewaarLaatst(data) {
    try { localStorage.setItem(LAATST, JSON.stringify(data)); } catch (e) { /* vol of uit */ }
  }

  function laadScript(src) {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (ok, nok) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () { nok(new Error('Supabase-bibliotheek niet bereikbaar')); };
      document.head.appendChild(s);
    });
  }

  function haalOnline() {
    if (LICHT) return lichtHaal();
    return sb.from('infoscherm').select('data').eq('id', 'hoofd').maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      return r.data ? r.data.data : null;
    });
  }

  function vernieuw() {
    if (!ONLINE || (!sb && !LICHT)) return Promise.resolve(cache);
    return haalOnline().then(function (data) {
      if (data) {
        cache = samenvoegen(data);
        bewaarLaatst(data);
        luisteraars.forEach(function (cb) { cb({ soort: 'instellingen' }); });
      }
      return cache;
    }, function (fout) {
      meldFout('Instellingen ophalen lukte niet', fout);
      return cache;
    });
  }

  function start() {
    if (gestart) return gestart;
    if (!ONLINE) { gestart = Promise.resolve(cache); return gestart; }

    gestart = (LICHT ? Promise.resolve() : laadScript(SUPABASE_JS)).then(function () {
      // Geladen maar niet leesbaar (te oude browser): dan ook de lichte weg.
      if (!LICHT && !(window.supabase && window.supabase.createClient)) LICHT = true;
      if (LICHT) {
        lichtVerbind();
        return haalOnline();
      }
      sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseSleutel);
      kanaal = sb.channel(KANAAL, { config: { broadcast: { self: false } } });
      kanaal.on('broadcast', { event: 'bericht' }, function (m) { verdeel(m.payload || {}); });
      var eerste = true;
      kanaal.subscribe(function (toestand) {
        // Na een onderbreking opnieuw ophalen: misschien is er intussen iets gewijzigd.
        if (toestand === 'SUBSCRIBED') {
          if (!eerste) vernieuw();
          eerste = false;
          luisteraars.forEach(function (cb) { cb({ soort: 'verbonden' }); });
        }
      });
      return haalOnline();
    }).then(function (data) {
      if (data) { cache = samenvoegen(data); bewaarLaatst(data); }
      return cache;
    }, function (fout) {
      // Niet bereikbaar bij het opstarten: verder met de laatst gekende instellingen.
      meldFout('Online instellingen niet bereikbaar, laatst gekende worden gebruikt', fout);
      setTimeout(function () { gestart = null; start().then(function () { verdeel({ soort: 'instellingen' }); }); }, 60000);
      return cache;
    });
    return gestart;
  }

  // --- lichte weg voor oudere TV-browsers: zonder de Supabase-bibliotheek ---
  var licht = { ws: null, ref: 0, verbonden: false, ooitVerbonden: false, hartslag: null, wachtOp: null, opnieuw: null, pauze: 5000 };

  function lichtBasis() { return String(CONFIG.supabaseUrl).replace(/\/+$/, ''); }

  function lichtHaal() {
    return fetch(lichtBasis() + '/rest/v1/infoscherm?id=eq.hoofd&select=data', {
      headers: { apikey: CONFIG.supabaseSleutel, Authorization: 'Bearer ' + CONFIG.supabaseSleutel }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (rijen) {
      return (rijen && rijen.length) ? rijen[0].data : null;
    });
  }

  function lichtStuur(event, payload, topic) {
    if (!licht.ws || licht.ws.readyState !== 1) return null;
    licht.ref += 1;
    var ref = String(licht.ref);
    licht.ws.send(JSON.stringify({ topic: topic || 'realtime:' + KANAAL, event: event, payload: payload, ref: ref }));
    return ref;
  }

  function lichtZend(bericht) {
    if (licht.verbonden) lichtStuur('broadcast', { type: 'broadcast', event: 'bericht', payload: bericht });
  }

  function lichtVerbind() {
    if (licht.ws || licht.opnieuw) return;
    var adres = lichtBasis().replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' +
      encodeURIComponent(CONFIG.supabaseSleutel) + '&vsn=1.0.0';
    var ws;
    try { ws = new WebSocket(adres); } catch (e) { lichtLater(); return; }
    licht.ws = ws;
    var joinRef = null;

    ws.onopen = function () {
      joinRef = lichtStuur('phx_join', {
        config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false }
      });
      // Hartslag: blijft een antwoord uit, dan is de verbinding dood en begint ze opnieuw.
      licht.hartslag = setInterval(function () {
        if (licht.wachtOp) { ws.close(); return; }
        licht.wachtOp = lichtStuur('heartbeat', {}, 'phoenix');
      }, 25000);
    };

    ws.onmessage = function (e) {
      var m;
      try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.event === 'phx_reply' && m.ref === licht.wachtOp) { licht.wachtOp = null; return; }
      if (m.event === 'phx_reply' && m.ref === joinRef) {
        if (m.payload && m.payload.status === 'ok') {
          var weer = licht.ooitVerbonden;
          licht.verbonden = true;
          licht.ooitVerbonden = true;
          licht.pauze = 5000;
          // Na een onderbreking opnieuw ophalen: misschien is er intussen iets gewijzigd.
          if (weer) vernieuw();
          luisteraars.forEach(function (cb) { cb({ soort: 'verbonden' }); });
        } else {
          meldFout('Berichtenkanaal weigert de verbinding', new Error(JSON.stringify(m.payload)));
          ws.close();
        }
        return;
      }
      if (m.event === 'broadcast' && m.payload && m.payload.event === 'bericht') {
        verdeel(m.payload.payload || {});
      } else if (m.event === 'phx_error' || m.event === 'phx_close') {
        ws.close();
      }
    };

    ws.onclose = function () {
      clearInterval(licht.hartslag);
      licht.ws = null;
      licht.verbonden = false;
      licht.wachtOp = null;
      lichtLater();
    };
    ws.onerror = function () { /* onclose volgt en verbindt opnieuw */ };
  }

  function lichtLater() {
    if (licht.opnieuw) return;
    licht.opnieuw = setTimeout(function () {
      licht.opnieuw = null;
      lichtVerbind();
    }, licht.pauze);
    licht.pauze = Math.min(licht.pauze * 2, 60000);
  }

  // Zonder berichtenkanaal komen wijzigingen niet vanzelf binnen: dan elke 30 seconden kijken.
  if (ONLINE) setInterval(function () { if (LICHT && gestart && !licht.verbonden) vernieuw(); }, 30000);

  // Schrijfopdrachten na elkaar, zodat een oudere nooit een nieuwere overschrijft.
  var schrijfRij = Promise.resolve();
  function schrijfOnline(data) {
    schrijfRij = schrijfRij.then(function () {
      return sb.from('infoscherm')
        .upsert({ id: 'hoofd', data: data, bijgewerkt: new Date().toISOString() })
        .then(function (r) {
          if (r.error) throw r.error;
          zend({ soort: 'instellingen', data: data });
        });
    }).then(null, function (fout) {
      meldFout('Opslaan lukte niet', fout);
    });
    return schrijfRij;
  }

  function laad() {
    return cache;
  }

  function bewaar(wijziging) {
    cache = Object.assign({}, cache, wijziging, { bijgewerkt: Date.now() });
    if (ONLINE) {
      schrijfOnline(cache);
    } else {
      localStorage.setItem(SLEUTEL, JSON.stringify(cache));
      zend({ soort: 'instellingen' });
    }
    return cache;
  }

  function herstel() {
    if (ONLINE) return bewaar(standaard());
    localStorage.removeItem(SLEUTEL);
    cache = standaard();
    zend({ soort: 'instellingen' });
    return cache;
  }

  function zend(bericht) {
    if (ONLINE) {
      if (LICHT) lichtZend(bericht);
      else if (kanaal) kanaal.send({ type: 'broadcast', event: 'bericht', payload: bericht });
    } else if (bc) {
      bc.postMessage(bericht);
    }
  }

  function zendLokaal(bericht) {
    bericht.lokaal = true;
    if (bc) bc.postMessage(bericht);
  }

  // --- IndexedDB: foto's in demostand, en de gekoppelde map (altijd lokaal op de pc) ---
  var dbBelofte = null;
  function db() {
    if (!dbBelofte) {
      dbBelofte = new Promise(function (ok, nok) {
        var r = indexedDB.open('infoscherm', 1);
        r.onupgradeneeded = function () {
          r.result.createObjectStore('fotos');
          r.result.createObjectStore('diversen');
        };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { nok(r.error); };
      });
    }
    return dbBelofte;
  }

  function idb(winkel, modus, actie) {
    return db().then(function (d) {
      return new Promise(function (ok, nok) {
        var t = d.transaction(winkel, modus);
        var verzoek = actie(t.objectStore(winkel));
        t.oncomplete = function () { ok(verzoek ? verzoek.result : undefined); };
        t.onerror = function () { nok(t.error); };
        t.onabort = function () { nok(t.error); };
      });
    });
  }

  // --- foto's: demo in IndexedDB, online in Supabase Storage (openbare link) ---
  function bestandsnaam(id) { return id + '.jpg'; }

  function fotoZet(id, blob) {
    if (!ONLINE) return idb('fotos', 'readwrite', function (s) { return s.put(blob, id); }).then(function () { return null; });
    var emmer = sb.storage.from(EMMER);
    return emmer.upload(bestandsnaam(id), blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: true })
      .then(function (r) {
        if (r.error) throw r.error;
        return emmer.getPublicUrl(bestandsnaam(id)).data.publicUrl;
      });
  }

  function fotoHaal(id) {
    if (ONLINE) return Promise.resolve(null);
    return idb('fotos', 'readonly', function (s) { return s.get(id); });
  }

  function fotoWis(id) {
    if (!ONLINE) return idb('fotos', 'readwrite', function (s) { return s.delete(id); });
    return sb.storage.from(EMMER).remove([bestandsnaam(id)]).then(function (r) { if (r.error) throw r.error; });
  }

  function fotosLeeg() {
    if (!ONLINE) return idb('fotos', 'readwrite', function (s) { return s.clear(); });
    var emmer = sb.storage.from(EMMER);
    return emmer.list('', { limit: 1000 }).then(function (r) {
      if (r.error) throw r.error;
      var namen = (r.data || []).map(function (f) { return f.name; });
      if (!namen.length) return;
      return emmer.remove(namen).then(function (x) { if (x.error) throw x.error; });
    });
  }

  // --- aanmelden (alleen online, alleen het beheer) ---
  function aangemeld() {
    if (!ONLINE) return Promise.resolve(true);
    return start().then(function () {
      return sb.auth.getSession().then(function (r) { return !!(r.data && r.data.session); });
    });
  }

  function meldAan(email, wachtwoord) {
    return start().then(function () {
      return sb.auth.signInWithPassword({ email: email, password: wachtwoord }).then(function (r) {
        if (r.error) throw r.error;
        return vernieuw();
      });
    });
  }

  function meldAf() {
    if (!ONLINE || !sb) return Promise.resolve();
    return sb.auth.signOut();
  }

  function zender(id) {
    for (var i = 0; i < ZENDERS.length; i++) if (ZENDERS[i].id === id) return ZENDERS[i];
    return null;
  }

  function weekNummer(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dag);
    var jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - jan1) / 86400000 + 1) / 7);
  }

  return {
    ONLINE: ONLINE,
    ZENDERS: ZENDERS,
    MEDEWERKERS: MEDEWERKERS,
    WEER: WEER,
    TEAMS_MAP: TEAMS_MAP,
    start: start,
    vernieuw: vernieuw,
    laad: laad,
    bewaar: bewaar,
    herstel: herstel,
    zend: zend,
    zendLokaal: zendLokaal,
    luister: function (cb) { luisteraars.push(cb); },
    luisterLokaal: function (cb) { lokaleLuisteraars.push(cb); },
    opFout: function (cb) { foutLuisteraars.push(cb); },
    zender: zender,
    weekNummer: weekNummer,
    fotoZet: fotoZet,
    fotoHaal: fotoHaal,
    fotoWis: fotoWis,
    fotosLeeg: fotosLeeg,
    aangemeld: aangemeld,
    meldAan: meldAan,
    meldAf: meldAf,
    diversenZet: function (k, v) { return idb('diversen', 'readwrite', function (s) { return s.put(v, k); }); },
    diversenHaal: function (k) { return idb('diversen', 'readonly', function (s) { return s.get(k); }); },
    diversenWis: function (k) { return idb('diversen', 'readwrite', function (s) { return s.delete(k); }); }
  };
})();
