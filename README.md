# OneSignal Web Push — demo

Statyczna strona pokazujaca mozliwosci OneSignal Web SDK v16. Uzytkownik
zapisuje sie pod **wlasnym ID**, dzieki czemu mozna do niego pozniej wyslac
powiadomienie pojedynczo. Bez backendu — wysylka idzie z panelu OneSignal
albo z terminala przez REST API.

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
4. Zapisz. Nie pobieraj plikow SDK z panelu — `OneSignalSDKWorker.js` juz tu jest.

SDK dziala **wylacznie** na domenie wpisanej jako Site URL. Na kazdej innej
(w tym `localhost`) init konczy sie bledem `Can only be used on: ...`, ktory
demo wypisuje w sekcji 5.

## Identyfikacja uzytkownikow

To sedno tego demo. Strona wola `OneSignal.login(id)` **przed** prosba o zgode,
wiec subskrypcja od razu powstaje pod konkretnym uzytkownikiem zamiast
anonimowo. W OneSignalu to pole nazywa sie **External ID**.

- jeden uzytkownik moze miec wiele urzadzen — wszystkie pod tym samym External ID
- ID jest zapamietane w `localStorage`, wiec przezywa odswiezenie strony
- przycisk zapisu jest nieaktywny, dopoki pole ID jest puste

W prawdziwej aplikacji zamiast pola tekstowego wolasz `OneSignal.login(...)`
z ID zalogowanego uzytkownika, zaraz po jego zalogowaniu.

## Wysylka do jednej osoby

```bash
curl -X POST https://api.onesignal.com/notifications \
  -H "Authorization: Key TWOJ_REST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "c3f290c3-e053-4410-a4a8-83d24e11c8b4",
    "target_channel": "push",
    "include_aliases": { "external_id": ["user_1234"] },
    "headings": { "en": "Czesc" },
    "contents": { "en": "Push tylko do Ciebie" }
  }'
```

Sekcja 3 na stronie generuje to polecenie z juz wklejonym Twoim ID.

- `include_aliases.external_id` przyjmuje do **20 000** ID w jednym wywolaniu,
  wiec „wybrani uzytkownicy" to po prostu dluzsza lista
- REST API Key trzymaj na serwerze. Z przegladarki kazdy moglby go odczytac
  i wysylac powiadomienia w Twoim imieniu
- to samo z panelu: **Audience -> Subscriptions**, wyszukaj po External ID

## Wysylka do grupy

Sekcja 4 dodaje tagi (np. `plan = pro`). W panelu: **Audience -> Segments ->
New Segment** -> filtr `plan is pro`, potem wyslij push do tego segmentu.

## Jak przetestowac

1. Otworz zdeployowana strone
2. Sekcja 1 -> wpisz ID -> **Zapisz mnie** -> zaakceptuj prompt przegladarki
3. Sekcja 3 -> skopiuj `curl`, podmien klucz, uruchom w terminalu
4. Powiadomienie pojawi sie na ekranie, a wpis w logu w sekcji 5

## Czego demo nie robi

Nie wysyla powiadomien ze strony — wymagaloby to REST API Key w przegladarce.
Do tego potrzebny bylby maly backend przyjmujacy zadanie i wolajacy OneSignala
swoim kluczem.
