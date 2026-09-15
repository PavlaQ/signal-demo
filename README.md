# OneSignal Web Push — demo

Statyczna strona pokazujaca mozliwosci OneSignal Web SDK v16: subskrypcja,
tagi, External ID i podglad zdarzen na zywo. Bez backendu — powiadomienia
wysylasz z panelu OneSignal.

## Pliki

| Plik | Rola |
|---|---|
| `index.html` | UI demo |
| `app.js` | cala logika OneSignala |
| `config.js` | App ID — jedyne miejsce do zmiany |
| `style.css` | wyglad |
| `OneSignalSDKWorker.js` | service worker, **musi lezec w katalogu glownym** |
| `vercel.json` | naglowki dla service workera |

## Deploy na Vercel

```bash
npx vercel --prod
```

Repo jest statyczne, wiec Vercel nie potrzebuje zadnego build stepa.

## Konfiguracja OneSignal (jednorazowo)

1. Panel OneSignal -> **Settings -> Push & In-App -> Web**
2. **Site URL**: domena z Vercela, np. `https://twoj-projekt.vercel.app` (bez ukosnika na koncu)
3. **Auto Resubscribe**: wlaczone
4. W sekcji lokalnego testowania zaznacz **My site is not fully HTTPS** tylko jesli
   testujesz na `http://localhost` — dla Vercela zostaw wylaczone
5. Zapisz. Nie pobieraj plikow SDK z panelu — `OneSignalSDKWorker.js` juz tu jest.

## Jak przetestowac

1. Otworz zdeployowana strone
2. Sekcja 2 -> **Wlacz powiadomienia** -> zaakceptuj prompt przegladarki
3. Sekcja 1 -> skopiuj **Subscription ID**
4. Panel OneSignal -> **Messages -> New Push** -> *Send to Test Device* -> wklej ID
5. Wyslij. Powiadomienie pojawi sie na ekranie, a wpis w logu w sekcji 5.

### Test segmentacji

1. Sekcja 3 -> dodaj tag, np. `plan` = `pro`
2. Panel -> **Audience -> Segments -> New Segment** -> filtr `plan is pro`
3. Wyslij push do tego segmentu

## Czego demo nie robi

Nie wysyla powiadomien ze strony. Wymagaloby to REST API Key, ktorego nie wolno
trzymac w przegladarce — potrzebny bylby maly backend.
