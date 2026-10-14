// TV-scherm: toont alles en speelt de radio. Bediening gebeurt enkel via beheer.html.
'use strict';

(function () {
  function $(id) { return document.getElementById(id); }
  var inst = Infoscherm.laad();

  // Deze TV. Staan er twee TV-vensters open, dan speelt alleen de nieuwste de radio.
  var mij = { id: Math.random().toString(36).slice(2), sinds: Date.now() };
  var nieuwereTvGezien = 0;
  function ikSpeel() { return Date.now() - nieuwereTvGezien > 12000; }

  // ---------- schaal: het hele scherm is op 1920x1080 ontworpen ----------
  function schaal() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    $('podium').style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  window.addEventListener('resize', schaal);
  schaal();

  // ---------- klok, datum, week ----------
  function twee(n) { return (n < 10 ? '0' : '') + n; }
  function klok() {
    var nu = new Date();
    var week = Infoscherm.weekNummer(nu);
    $('klok').textContent = twee(nu.getHours()) + ':' + twee(nu.getMinutes());
    var datum = nu.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('datum').textContent = datum.charAt(0).toUpperCase() + datum.slice(1);
    $('week').textContent = 'Week ' + week;
    $('leveringWeek').textContent = 'WEEK ' + week;
  }
  klok();
  setInterval(klok, 1000);

  // ---------- levering en contacten ----------
  function toonLevering() {
    $('leveringNaam').textContent = inst.levering || '-';
  }

  function toonContacten() {
    var lijst = $('contactLijst');
    lijst.innerHTML = '';
    var gevuld = (inst.contacten || []).filter(function (c) { return c.naam || c.tel; }).slice(0, 4);
    lijst.style.gridTemplateColumns = 'repeat(' + Math.max(1, gevuld.length) + ', 1fr)';
    gevuld.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'contact';
      var b = document.createElement('b');
      b.textContent = c.naam;
      var s = document.createElement('span');
      s.textContent = c.tel;
      d.appendChild(b);
      d.appendChild(s);
      lijst.appendChild(d);
    });
  }

  // ---------- fotocarrousel ----------
  var lagen = [$('laag0'), $('laag1')];
  var car = { lijst: [], ids: null, nr: -1, huidigId: null, actief: 0, timer: null, token: 0, urls: {}, wisseltijd: 0 };

  function fotoUrl(f) {
    if (f.url) return Promise.resolve(f.url);
    if (car.urls[f.id]) return Promise.resolve(car.urls[f.id]);
    return Infoscherm.fotoHaal(f.id).then(function (blob) {
      if (!blob) return null;
      car.urls[f.id] = URL.createObjectURL(blob);
      return car.urls[f.id];
    });
  }

  function laadBeeld(url) {
    return new Promise(function (ok, nok) {
      var im = new Image();
      im.onload = function () { ok(url); };
      im.onerror = nok;
      im.src = url;
    });
  }

  function teller() {
    var n = car.lijst.length;
    $('teller').textContent = n ? (car.nr + 1) + ' / ' + n : "0 foto's";
  }

  function voortgang() {
    var el = $('voortgang');
    el.style.transition = 'none';
    el.style.transform = 'scaleX(0)';
    void el.offsetWidth;
    if (car.lijst.length > 1) {
      el.style.transition = 'transform ' + inst.wisseltijd + 'ms linear';
      el.style.transform = 'scaleX(1)';
    }
  }

  function plan() {
    clearTimeout(car.timer);
    car.wisseltijd = inst.wisseltijd;
    if (car.lijst.length > 1) {
      car.timer = setTimeout(function () { toonFoto(car.nr + 1); }, inst.wisseltijd);
    }
  }

  function toonLeeg() {
    clearTimeout(car.timer);
    car.token++;
    car.nr = -1;
    car.huidigId = null;
    lagen[0].classList.remove('zicht');
    lagen[1].classList.remove('zicht');
    $('leeg').classList.remove('verborgen');
    teller();
    voortgang();
  }

  function toonFoto(i, pogingen, token) {
    var n = car.lijst.length;
    if (!n) return toonLeeg();
    if (token === undefined) token = ++car.token;
    pogingen = pogingen || 0;
    if (pogingen >= n) { toonLeeg(); return; }
    i = ((i % n) + n) % n;
    var f = car.lijst[i];

    fotoUrl(f)
      .then(function (url) {
        if (!url) throw new Error('geen bestand');
        return laadBeeld(url);
      })
      .then(function (url) {
        if (token !== car.token) return;
        var volgende = 1 - car.actief;
        var laag = lagen[volgende];
        laag.querySelector('.waas').style.backgroundImage = 'url("' + url + '")';
        laag.querySelector('.foto').src = url;
        lagen[car.actief].classList.remove('zicht');
        laag.classList.add('zicht');
        car.actief = volgende;
        car.nr = i;
        car.huidigId = f.id;
        $('leeg').classList.add('verborgen');
        teller();
        voortgang();
        plan();
        stuurStatus();
      })
      .catch(function () {
        if (token === car.token) toonFoto(i + 1, pogingen + 1, token);
      });
  }

  function zetFotos(fotos) {
    fotos = fotos || [];
    var ids = fotos.map(function (f) { return f.id + '=' + (f.url || ''); }).join('|');
    if (ids === car.ids) {
      if (car.wisseltijd !== inst.wisseltijd && car.nr >= 0) { voortgang(); plan(); }
      return;
    }
    car.ids = ids;

    Object.keys(car.urls).forEach(function (id) {
      var blijft = fotos.some(function (f) { return f.id === id; });
      if (!blijft) { URL.revokeObjectURL(car.urls[id]); delete car.urls[id]; }
    });

    var vorigeNr = car.nr;
    car.lijst = fotos.slice();
    if (!fotos.length) { toonLeeg(); return; }

    var pos = -1;
    for (var i = 0; i < fotos.length; i++) if (fotos[i].id === car.huidigId) pos = i;
    if (pos === -1) {
      toonFoto(vorigeNr < 0 ? 0 : Math.min(vorigeNr, fotos.length - 1));
    } else {
      car.nr = pos;
      teller();
      if (car.wisseltijd !== inst.wisseltijd || !car.timer) { voortgang(); plan(); }
      stuurStatus();
    }
  }

  // ---------- weer (Open-Meteo, geen sleutel nodig) ----------
  function stralen(cx, cy, r1, r2) {
    var s = '';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      s += '<line x1="' + (cx + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (cy + r1 * Math.sin(a)).toFixed(1) +
        '" x2="' + (cx + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r2 * Math.sin(a)).toFixed(1) + '"/>';
    }
    return s;
  }
  function zon(cx, cy, k) {
    return '<g stroke="#ffd25a" stroke-width="' + (4 * k) + '" stroke-linecap="round">' + stralen(cx, cy, 17 * k, 24 * k) +
      '</g><circle cx="' + cx + '" cy="' + cy + '" r="' + (11 * k) + '" fill="#ffd25a"/>';
  }
  var MAAN = '<path d="M38 12a20 20 0 1 0 14 30A16 16 0 0 1 38 12z" fill="#d6e4ff"/>';
  var MAAN_KLEIN = '<path d="M26 6a13 13 0 1 0 10 19A10 10 0 0 1 26 6z" fill="#d6e4ff"/>';
  function wolkT(transform, kleur) {
    return '<path transform="' + transform + '" d="M18 48h28a11 11 0 0 0 1-22 15 15 0 0 0-28-4 12 12 0 0 0-1 26z" fill="' + (kleur || '#cfe0ff') + '"/>';
  }
  function wolk(dy, kleur) { return wolkT('translate(0,' + dy + ')', kleur); }
  var DRUPPELS = '<g stroke="#2dd4ee" stroke-width="4" stroke-linecap="round"><line x1="24" y1="48" x2="21" y2="57"/><line x1="34" y1="48" x2="31" y2="57"/><line x1="44" y1="48" x2="41" y2="57"/></g>';
  var MOTREGEN = '<g stroke="#2dd4ee" stroke-width="3" stroke-linecap="round"><line x1="27" y1="49" x2="25" y2="54"/><line x1="39" y1="49" x2="37" y2="54"/></g>';
  var VLOKKEN = '<g fill="#ffffff"><circle cx="23" cy="51" r="3.2"/><circle cx="33" cy="57" r="3.2"/><circle cx="43" cy="51" r="3.2"/></g>';
  var BLIKSEM = '<polygon points="35,40 26,54 33,54 29,63 42,47 35,47 39,40" fill="#ffd25a"/>';
  var MIST = '<g stroke="#8fa6c9" stroke-width="4" stroke-linecap="round"><line x1="12" y1="46" x2="52" y2="46"/><line x1="16" y1="54" x2="48" y2="54"/></g>';

  function weerSoort(code) {
    if (code === 0) return ['helder', 'Helder'];
    if (code === 1) return ['licht', 'Overwegend helder'];
    if (code === 2) return ['half', 'Half bewolkt'];
    if (code === 3) return ['wolk', 'Bewolkt'];
    if (code === 45 || code === 48) return ['mist', 'Mist'];
    if (code >= 51 && code <= 57) return ['motregen', 'Motregen'];
    if (code === 66 || code === 67) return ['regen', 'IJzel'];
    if (code === 61) return ['regen', 'Lichte regen'];
    if (code === 63) return ['regen', 'Regen'];
    if (code === 65) return ['regen', 'Zware regen'];
    if (code >= 71 && code <= 77) return ['sneeuw', 'Sneeuw'];
    if (code >= 80 && code <= 82) return ['regen', 'Regenbuien'];
    if (code === 85 || code === 86) return ['sneeuw', 'Sneeuwbuien'];
    if (code >= 95) return ['onweer', 'Onweer'];
    return ['wolk', 'Bewolkt'];
  }

  function weerIcoon(soort, dag) {
    var binnen;
    if (soort === 'helder') binnen = dag ? zon(32, 32, 1) : MAAN;
    else if (soort === 'licht' || soort === 'half') binnen = (dag ? zon(23, 21, soort === 'licht' ? 0.85 : 0.72) : MAAN_KLEIN) + wolk(soort === 'licht' ? 12 : 8);
    else if (soort === 'wolk') binnen = wolkT('translate(-4,-6) scale(.9)', '#9fb4d6') + wolk(6);
    else if (soort === 'mist') binnen = wolk(-10) + MIST;
    else if (soort === 'motregen') binnen = wolk(-6) + MOTREGEN;
    else if (soort === 'regen') binnen = wolk(-6) + DRUPPELS;
    else if (soort === 'sneeuw') binnen = wolk(-6) + VLOKKEN;
    else if (soort === 'onweer') binnen = wolk(-8, '#9fb4d6') + BLIKSEM;
    else binnen = wolk(4);
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + binnen + '</svg>';
  }

  var weerLaatst = 0;
  function weer() {
    var w = Infoscherm.WEER;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + w.lat + '&longitude=' + w.lon +
      '&current=temperature_2m,weather_code,wind_speed_10m,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=Europe%2FBrussels&forecast_days=5';
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var c = d.current, dd = d.daily;
        var soort = weerSoort(c.weather_code);
        $('weerIcoon').innerHTML = weerIcoon(soort[0], c.is_day === 1);
        $('temperatuur').textContent = Math.round(c.temperature_2m) + '°';
        $('weerTekst').textContent = soort[1];
        $('wind').textContent = Math.round(c.wind_speed_10m) + ' km/u';
        $('bereik').textContent = Math.round(dd.temperature_2m_min[0]) + '° / ' + Math.round(dd.temperature_2m_max[0]) + '°';

        var html = '';
        for (var i = 1; i < dd.time.length && i <= 4; i++) {
          var naam = new Date(dd.time[i] + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'short' }).replace('.', '');
          html += '<div class="dag"><div class="dag-naam">' + naam + '</div>' +
            '<div class="dag-icoon">' + weerIcoon(weerSoort(dd.weather_code[i])[0], true) + '</div>' +
            '<div class="dag-temp">' + Math.round(dd.temperature_2m_max[i]) + '° <span>' + Math.round(dd.temperature_2m_min[i]) + '°</span></div></div>';
        }
        $('voorspelling').innerHTML = html;
        weerLaatst = Date.now();
        $('weerStatus').className = 'status-punt ok';
      })
      .catch(function () {
        $('weerStatus').className = 'status-punt ' + (weerLaatst ? 'oud' : 'fout');
        if (!weerLaatst) $('weerTekst').textContent = 'Weerbericht niet bereikbaar';
      });
  }
  weer();
  setInterval(weer, 15 * 60 * 1000);
  setInterval(function () {
    if (weerLaatst && Date.now() - weerLaatst > 45 * 60 * 1000) $('weerStatus').className = 'status-punt oud';
  }, 60 * 1000);

  // ---------- radio: aan/uit via beheer, geluid uit de TV ----------
  var audio = $('radio');
  var radio = { toestand: 'gestopt', zender: null, herTimer: null, laatsteTijd: -1, stil: 0 };

  function zetRadio(t) {
    radio.toestand = t;
    var z = Infoscherm.zender(radio.zender);
    $('radioPilNaam').textContent = z ? z.naam : '';
    $('radioPil').classList.toggle('verborgen', t !== 'speelt');
    $('geluidVraag').classList.toggle('verborgen', t !== 'geblokkeerd');
    stuurStatus();
  }

  function radioSpeel() {
    clearTimeout(radio.herTimer);
    zetRadio('laden');
    var p = null;
    try { p = audio.play(); } catch (e) { p = null; }
    if (p && p.then) {
      p.then(null, function (err) {
        if (!radio.zender) return;
        if (err && err.name === 'NotAllowedError') zetRadio('geblokkeerd');
        else if (!err || err.name !== 'AbortError') radioFout();
      });
    }
  }

  function radioOpnieuw() {
    var z = Infoscherm.zender(radio.zender);
    if (!z) return;
    audio.src = z.url;
    radioSpeel();
  }

  function radioFout() {
    zetRadio('fout');
    clearTimeout(radio.herTimer);
    radio.herTimer = setTimeout(function () { if (radio.zender) radioOpnieuw(); }, 8000);
  }

  function radioStop() {
    clearTimeout(radio.herTimer);
    if (!radio.zender && radio.toestand === 'gestopt') return;
    radio.zender = null;
    audio.pause();
    // src weghalen, anders blijft de browser de livestream binnenhalen
    audio.removeAttribute('src');
    try { audio.load(); } catch (e) { /* niets te doen */ }
    zetRadio('gestopt');
  }

  function radioToepassen() {
    var r = inst.radio || {};
    var vol = Number(r.volume);
    audio.volume = isNaN(vol) ? 0.7 : Math.max(0, Math.min(1, vol));
    var z = (r.speelt && ikSpeel()) ? Infoscherm.zender(r.zender) : null;
    if (!z) { radioStop(); return; }
    if (radio.zender !== z.id) {
      radio.zender = z.id;
      audio.src = z.url;
      radioSpeel();
    } else if (audio.paused && radio.toestand === 'gestopt') {
      radioSpeel();
    }
  }

  audio.addEventListener('playing', function () { if (radio.zender) zetRadio('speelt'); });
  audio.addEventListener('error', function () { if (radio.zender && audio.getAttribute('src')) radioFout(); });

  // Een livestream die stilvalt (netwerk weg en terug) opnieuw starten.
  setInterval(function () {
    if (radio.toestand !== 'speelt') { radio.stil = 0; radio.laatsteTijd = -1; return; }
    if (audio.currentTime === radio.laatsteTijd) radio.stil++; else radio.stil = 0;
    radio.laatsteTijd = audio.currentTime;
    if (radio.stil >= 2) { radio.stil = 0; radioOpnieuw(); }
  }, 10000);

  // De browser laat pas geluid toe na één klik of toets op dit scherm.
  function ontgrendel() { if (radio.toestand === 'geblokkeerd') radioSpeel(); }
  document.addEventListener('click', ontgrendel);
  document.addEventListener('keydown', ontgrendel);
  document.addEventListener('touchstart', ontgrendel);

  // ---------- status naar beheer ----------
  // Online stuurt de TV alleen status zolang er een beheerpagina openstaat
  // (die vraagt er elke 30 seconden om). Zo blijft het verkeer klein.
  var beheerVroeg = 0;
  function beheerKijkt() { return !Infoscherm.ONLINE || Date.now() - beheerVroeg < 120000; }

  function stuurStatus() {
    if (!ikSpeel() || !beheerKijkt()) return;
    Infoscherm.zend({
      soort: 'tv-status', id: mij.id, sinds: mij.sinds,
      radio: radio.toestand, zender: radio.zender,
      foto: car.lijst.length ? car.nr + 1 : 0, fotos: car.lijst.length, fotoId: car.huidigId,
      tijd: Date.now()
    });
  }
  setInterval(function () {
    stuurStatus();
    if (ikSpeel() && inst.radio && inst.radio.speelt && !radio.zender) radioToepassen();
  }, Infoscherm.ONLINE ? 10000 : 4000);

  // Twee TV-vensters in dezelfde browser: alleen het nieuwste speelt de radio.
  setInterval(function () {
    Infoscherm.zendLokaal({ soort: 'tv-hier', id: mij.id, sinds: mij.sinds });
  }, 4000);
  Infoscherm.zendLokaal({ soort: 'tv-hier', id: mij.id, sinds: mij.sinds });
  Infoscherm.luisterLokaal(function (b) {
    if (b.soort === 'tv-hier' && b.id !== mij.id && b.sinds > mij.sinds) {
      nieuwereTvGezien = Date.now();
      if (radio.zender) radioStop();
    }
  });

  // ---------- alles toepassen ----------
  function toepassen() {
    toonLevering();
    toonContacten();
    zetFotos(inst.fotos);
    radioToepassen();
  }

  Infoscherm.luister(function (b) {
    if (b.soort === 'instellingen') {
      inst = Infoscherm.laad();
      toepassen();
    } else if (b.soort === 'vraag-status') {
      beheerVroeg = Date.now();
      stuurStatus();
    }
  });
  Infoscherm.opFout(function (tekst) { if (window.console) console.warn('[infoscherm] ' + tekst); });

  // Eerst tonen wat er al gekend is, dan bijwerken zodra de instellingen binnen zijn.
  toepassen();
  Infoscherm.start().then(function () {
    inst = Infoscherm.laad();
    toepassen();
    stuurStatus();
  });
  // Vangnet voor een gemist bericht: online elke 5 minuten de instellingen opnieuw lezen.
  if (Infoscherm.ONLINE) setInterval(function () { Infoscherm.vernieuw(); }, 5 * 60 * 1000);

  // ---------- TV-gemakken ----------
  var muisTimer = null;
  document.addEventListener('mousemove', function () {
    document.body.classList.remove('muis-weg');
    clearTimeout(muisTimer);
    muisTimer = setTimeout(function () { document.body.classList.add('muis-weg'); }, 3000);
  });

  document.addEventListener('dblclick', function () {
    var el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  });

  // Elke nacht om 4u even herladen: een scherm dat wekenlang open staat blijft zo fris.
  setInterval(function () {
    var n = new Date();
    if (n.getHours() === 4 && n.getMinutes() === 0 && Date.now() - mij.sinds > 3600000) location.reload();
  }, 60000);
})();
