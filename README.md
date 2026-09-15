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
| `admin.html` / `admin.js` | panel wysylki: lista uzytkownikow, osobny push do kazdego |
| `api/users.js` | lista zapisanych uzytkownikow |
| `api/send.js` | wysylka pusha do jednego External ID |
| `api/_onesignal.js` | wspolna obsluga wywolan do OneSignala |

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

## Zmienne srodowiskowe

Endpoint `api/create-segment.js` potrzebuje dwoch zmiennych. Vercel ->
**Settings -> Environment Variables**:

| Zmienna | Skad | Wymagana |
|---|---|---|
| `ONESIGNAL_REST_API_KEY` | OneSignal -> Settings -> Keys & IDs | tak |
| `ONESIGNAL_APP_ID` | OneSignal -> Settings -> Keys & IDs | tak |
| `ADMIN_TOKEN` | wymyslasz sam | nie, ale patrz nizej |

Bez `ADMIN_TOKEN` panel `/admin.html` jest **otwarty dla kazdego, kto zna
adres** — i kazdy moze wyslac powiadomienie do Twoich uzytkownikow. Panel
wyswietla wtedy ostrzezenie. Ustaw token, zanim wystawisz to gdziekolwiek
poza wlasnym testem.

Bez nich reszta demo dziala normalnie — nie powstanie tylko segment, a log
w sekcji 6 powie dlaczego.

Po zmianie zmiennych zrob **redeploy** — istniejacy deployment ich nie zobaczy.

### HTTP 401 przy tworzeniu segmentu

Klucz dotarl, ale zostal odrzucony. Endpoint probuje obu schematow
autoryzacji (`Key` dla App API Key, `Basic` dla starszego Legacy REST API Key)
i przycina biale znaki, wiec zostaja trzy przyczyny:

1. w zmiennej siedzi **Organization API Key** zamiast App API Key
2. klucz nalezy do innej aplikacji niz `ONESIGNAL_APP_ID`
3. zmienne ustawione, ale bez redeployu

Szybki test klucza z terminala:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.onesignal.com/apps/TWOJ_APP_ID/segments \
  -H "Authorization: Key TWOJ_KLUCZ"
```

`200` = klucz dobry.

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

Segmentu **nie da sie utworzyc z przegladarki** — Web SDK nie ma takiego API.
Segment to zreszta nie lista osob, tylko zapisany filtr; czlonkostwo wylicza
sie samo. Z aplikacji nadajesz wiec tag, a grupe definiujesz po stronie wysylki.

Sekcja 4 przypisuje tag `grupa` i generuje polecenie celujace w cala grupe:

```bash
curl -X POST https://api.onesignal.com/notifications \
  -H "Authorization: Key TWOJ_REST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "c3f290c3-e053-4410-a4a8-83d24e11c8b4",
    "target_channel": "push",
    "filters": [
      { "field": "tag", "key": "grupa", "relation": "=", "value": "vip" }
    ],
    "contents": { "en": "Push do calej grupy vip" }
  }'
```

`filters` liczy odbiorcow w momencie wysylki, wiec segment w panelu jest zbedny.

`filters` i `include_aliases` wykluczaja sie — jedno wywolanie celuje albo w
liste ID, albo w filtr, nigdy w oba naraz.

### Kiedy jednak zalozyc segment

Gdy ta sama grupa przyda sie regularnie. Panel: **Audience -> Segments ->
New Segment** -> filtr `grupa is vip`. Programowo, wylacznie z serwera:

```bash
curl -X POST https://api.onesignal.com/apps/c3f290c3-e053-4410-a4a8-83d24e11c8b4/segments \
  -H "Authorization: Key TWOJ_REST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VIP",
    "filters": [
      { "field": "tag", "key": "grupa", "relation": "=", "value": "vip" }
    ]
  }'
```

Sekcja 5 robi to samo co 4, ale dla dowolnych par klucz-wartosc.

## Jak przetestowac

1. Otworz zdeployowana strone
2. Sekcja 1 -> wpisz ID -> **Zapisz mnie** -> zaakceptuj prompt przegladarki
3. Sekcja 3 -> skopiuj `curl`, podmien klucz, uruchom w terminalu
4. Powiadomienie pojawi sie na ekranie, a wpis w logu w sekcji 5

## Panel wysylki

`/admin.html` listuje zapisanych uzytkownikow i pozwala wyslac osobne
powiadomienie do kazdego z nich. Wysylka idzie przez `include_aliases`, wiec
nie wymaga segmentow ani platnego planu.

Lista uzytkownikow korzysta z endpointu listujacego subskrypcje, ktory bywa
niedostepny. Gdy zawiedzie, panel nadal dziala — formularz "Wyslij na wpisane
ID" nie zalezy od listy.

### Czego nie da sie zrobic bez platnego planu

Create Segment API zwraca `403 — This API is not available for applications on
your plan`. Nie da sie wiec zakladac segmentow programowo. To nie blokuje
niczego istotnego: wysylka po External ID (`include_aliases`) i po tagu
(`filters`) dziala na kazdym planie, a segment mozna zalozyc recznie w panelu
OneSignal — strona nadaje tag `uid` rowny External ID wlasnie po to.

## Czego demo nie robi

Nie wysyla powiadomien ze strony — wymagaloby to REST API Key w przegladarce.
Do tego potrzebny bylby maly backend przyjmujacy zadanie i wolajacy OneSignala
swoim kluczem.
