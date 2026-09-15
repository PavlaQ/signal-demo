# Web Push — demo bez uslug trzecich

Lista zapisanych uzytkownikow i osobne powiadomienie do kazdego z nich.
Bez OneSignala i bez zadnego posrednika: wlasne klucze VAPID, wlasna baza
subskrypcji, wysylka wprost pod endpoint, ktory dala przegladarka.

## Jak to dziala

```
Przegladarka                 Twoj serwer               Serwer przegladarki
────────────                 ───────────               ───────────────────
subscribe(VAPID_PUBLIC)
 → {endpoint, p256dh, auth}
      POST /api/subscribe ──→ zapis do Postgresa

                             POST /api/send
                             webpush.sendNotification ──→ POST na endpoint
                                                              ↓
                             service worker  ←──────────── push
                             showNotification()
```

Nie rozmawiasz z Google ani Mozilla. Wysylasz zadanie pod adres, ktory zwrocila
przegladarka, podpisane kluczem VAPID. Dostarczanie jest darmowe i nie wymaga
konta u nikogo.

## Pliki

| Plik | Rola |
|---|---|
| `index.html` / `app.js` | zapis uzytkownika i podglad stanu |
| `admin.html` / `admin.js` | panel: lista uzytkownikow, osobna wysylka do kazdego |
| `sw.js` | service worker — odbiera push i wyswietla powiadomienie |
| `api/subscribe.js` | zapis subskrypcji, powiazanie z ID uzytkownika |
| `api/unsubscribe.js` | usuniecie subskrypcji na zadanie uzytkownika |
| `api/users.js` | lista uzytkownikow zgrupowana po `user_id` |
| `api/send.js` | wysylka na wszystkie urzadzenia jednego uzytkownika |
| `api/config.js` | oddaje przegladarce publiczny klucz VAPID |
| `api/_db.js` | Neon Postgres, schemat zaklada sie sam |
| `api/_http.js` | walidacja ID, ochrona panelu, odczyt ciala zadania |

## Uruchomienie

### 1. Baza

Vercel -> **Storage -> Create Database -> Neon Postgres**. Integracja sama
ustawi `DATABASE_URL`. Tabela `subscriptions` zaklada sie przy pierwszym
zapisie, wiec nie ma osobnego kroku migracji.

### 2. Klucze VAPID

Wygenerowane juz sa w `.env.local` (plik jest w `.gitignore`). Gdybys
potrzebowal nowych:

```bash
npx web-push generate-vapid-keys
```

Rotacja kluczy uniewaznia **wszystkie** istniejace subskrypcje — po zmianie
kazdy musi zapisac sie ponownie.

### 3. Zmienne srodowiskowe

Vercel -> Settings -> Environment Variables:

| Zmienna | Wartosc | Wymagana |
|---|---|---|
| `DATABASE_URL` | ustawia integracja Neona | tak |
| `VAPID_PUBLIC_KEY` | z `.env.local` | tak |
| `VAPID_PRIVATE_KEY` | z `.env.local` | tak |
| `VAPID_SUBJECT` | `mailto:twoj@email` | tak |
| `ADMIN_TOKEN` | wymyslasz sam | nie, ale patrz nizej |

Bez `ADMIN_TOKEN` panel `/admin.html` jest **otwarty dla kazdego, kto zna
adres** — i kazdy moze wyslac powiadomienie do Twoich uzytkownikow. Panel
wyswietla wtedy ostrzezenie.

Po kazdej zmianie zmiennych zrob redeploy.

### 4. Deploy

```bash
npx vercel --prod
```

## Test

1. Otworz strone, wpisz ID, **Zapisz mnie**, zaakceptuj prompt
2. Wejdz na `/admin.html` — Twoje ID jest na liscie
3. Wpisz tresc, **Wyslij**
4. Powiadomienie pojawi sie na ekranie, takze przy zamknietej karcie

## Schemat bazy

```sql
CREATE TABLE subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`endpoint` jest unikalny, wiec ponowny zapis z tej samej przegladarki
aktualizuje wpis zamiast tworzyc duplikat. To takze sciezka przypisania
urzadzenia do innego uzytkownika.

## Powiadomienie nie pojawia sie na ekranie

Jesli log na stronie pokazuje „Odebrane", ale nic nie widac, push doszedl —
blokada jest w wyswietlaniu. Kliknij **Pokaz testowe powiadomienie**: omija
siec i wyswietla powiadomienie lokalnie. Jesli tez go nie widac, sprawdz
kolejno:

1. **macOS -> Ustawienia -> Powiadomienia -> Google Chrome** — „Zezwalaj na
   powiadomienia" wlaczone, styl ustawiony na *Banery* lub *Alerty*
2. **Tryb skupienia / Nie przeszkadzac** — wylaczony
3. **chrome://settings/content/notifications** — strona nie jest na liscie
   zablokowanych
4. **Windows -> Ustawienia -> System -> Powiadomienia** — Chrome dozwolony,
   asystent koncentracji wylaczony

Powiadomienia maja `requireInteraction: true`, wiec zostaja na ekranie do
zamkniecia. Jesli mimo to znikaja same, system je przycina — patrz punkt 1.

## Wygasle subskrypcje

Serwer push odpowiada `404` lub `410`, gdy uzytkownik sie wypisal albo
wyczyscil dane przegladarki. `api/send.js` kasuje wtedy wpis z bazy i podaje
liczbe usunietych w odpowiedzi. Bez tego baza zapelnialaby sie martwymi
rekordami — to jedyna rzecz, ktora uslugi typu OneSignal robia za Ciebie.

## Czego demo nie ma

Harmonogramu wysylek, analityki dostarczen, segmentow ani grup. Do ich
dolozenia wystarczy kolumna w `subscriptions` i filtr w zapytaniu — nie ma tu
zadnego zewnetrznego ograniczenia.

## Powiadomienia na iOS

Safari na iOS obsluguje Web Push dopiero po dodaniu strony do ekranu
poczatkowego (Udostepnij -> Do ekranu poczatkowego). Wymaga to manifestu PWA,
ktorego to demo nie zawiera.
