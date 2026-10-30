# My Epitech → Google Calendar pour Firefox

Extension Firefox 142+ pour ordinateur, sans Python, serveur ni abonnement. Elle récupère la session My dans `@account` et copie le planning dans un agenda Google dédié.

## Installation en une commande

Le dépôt est privé : installer [GitHub CLI](https://cli.github.com/) et se connecter une fois avec `gh auth login`, puis :

```bash
gh api repos/Lluciocc/sync-calendar-epitech/contents/install.sh --jq .content | base64 --decode | bash
```

L’installateur télécharge la dernière release, vérifie son empreinte SHA-256 et prépare les fichiers dans `~/.local/share/sync-calendar-epitech`. Il affiche une progression colorée en quatre étapes, avec animation dans un terminal compatible. `NO_COLOR=1` désactive les couleurs ; aucune animation n’est affichée si la sortie est redirigée.

- **XPI signé disponible :** ouvre Firefox pour confirmer l’installation ; si nécessaire, installer le fichier indiqué depuis la roue dentée de `about:addons`.
- **Pas encore de XPI signé :** prépare la version de développement et ouvre `about:debugging`. Il reste à sélectionner **Charger un module complémentaire temporaire**, puis le `manifest.json` indiqué. Firefox retirera ce chargement temporaire au redémarrage.

L’installateur ne modifie aucun profil Firefox, ne désactive aucune protection et ne demande pas `sudo`. Les téléchargements privés passent par `gh`, sans inclure de token dans la commande. Une release doit avoir été publiée avant de lancer l’installation.

Depuis un clone du dépôt, options disponibles :

```bash
bash install.sh --help
bash install.sh --version v1.0.0 --no-open
bash install.sh --dev
```

Pour installer dans un dossier personnalisé : `bash install.sh --dir "$HOME/Applications/My Calendar"`. L’installeur nécessite Bash, Python 3 et soit `gh` authentifié pour ce dépôt privé, soit `curl` pour un dépôt public. Il conserve les anciennes versions et actualise le lien `current` après vérification.

Si le dépôt devient public, cette commande fonctionne aussi :

```bash
curl -fsSL https://raw.githubusercontent.com/Lluciocc/sync-calendar-epitech/main/install.sh | bash
```

## Installation manuelle

1. Décompresser cette archive dans un dossier conservé sur ton ordinateur.
2. Dans Firefox, ouvrir **about:debugging#/runtime/this-firefox**.
3. Cliquer **Charger un module complémentaire temporaire** et sélectionner **manifest.json**.
4. Ouvrir le bouton de l’extension → **Connexions et réglages**.
5. Importer le JSON OAuth Google, puis cliquer **Connecter Google** (configuration ci-dessous).
6. Ouvrir **https://my.epitech.eu/planning** en étant connecté. La session est détectée sans copier de token.

Pour appliquer immédiatement une modification ou relancer un import : bouton **Synchroniser maintenant**, dans le panneau de l’extension ou les réglages.

**Installation temporaire :** Firefox retire les extensions temporaires au redémarrage. Les archives ZIP et `-unsigned.xpi` ne sont pas signées. Pour une installation durable dans Firefox standard, utiliser le XPI signé par Mozilla, publié lorsque les secrets de signature sont configurés dans la CI. Le fichier `manifest.json` se trouve à la racine des archives. Le nom d’extension et son identifiant sont stables ; garder le stockage de l’extension pour conserver l’agenda cible. Une désinstallation ou une perte de ce stockage peut entraîner la création d’un nouvel agenda à la réinstallation.

## Connexion Google : configuration unique

Les cookies de Google ne donnent pas à une extension l’autorisation d’écrire dans Calendar. L’extension utilise donc la fenêtre officielle Google, où tu choisis ton compte déjà connecté et autorises l’accès.

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/) et créer un projet.
2. Activer **Google Calendar API** pour ce projet.
3. Configurer **Google Auth Platform** : nom de l’application, contact et audience. Pour un Gmail personnel, audience External ; si l’application est en mode Testing, ajouter ton adresse Google aux utilisateurs de test.
4. Créer un client OAuth de type **Desktop app / Application de bureau**.
5. Télécharger son JSON, puis l’importer dans **Connexions et réglages** de l’extension.
6. Cliquer **Connecter Google** et terminer l’autorisation dans la fenêtre qui s’ouvre.

Tu peux réutiliser le JSON Desktop créé pour le programme Python précédent. Il n’est pas nécessaire d’installer ce programme.

L’extension utilise le flux de code avec PKCE, une redirection locale spéciale prise en charge par Firefox, puis un refresh token Google pour renouveler l’accès sans interaction. Aucun serveur local n’est nécessaire : Firefox intercepte la redirection. La redirection calculée est visible dans les réglages, sous **Diagnostic de redirection Firefox**. En cas de `redirect_uri_mismatch`, vérifier en premier que le JSON est bien de type **Desktop**, pas Web.

Autorisation Calendar demandée : `calendar.app.created`, limitée aux agendas créés par cette application. `openid email` permet d’identifier le compte choisi et d’afficher son adresse. Un agenda distinct est mémorisé pour chaque combinaison client OAuth / compte Google / compte My.

Google peut expirer ou révoquer un refresh token, notamment pour une application en mode Testing. Si l’extension le signale, cliquer **Connecter Google** à nouveau. Une synchronisation automatique n’ouvre jamais une fenêtre de connexion de force.

## Comportement quotidien

- À chaque arrivée sur My, la page transmet uniquement le token de sa session à l’extension.
- La première visite du jour déclenche un import, une fois Google configuré.
- Le jour est calculé en **Europe/Paris**. Ouvrir plusieurs onglets simultanément ne lance qu’un import.
- L’import quotidien est considéré réussi seulement une fois tous les événements traités.
- En cas d’erreur, la prochaine visite peut réessayer après cinq minutes. Le bouton manuel contourne ce délai et la limite quotidienne.
- Les changements d’adresse au sein de My sont également détectés. Une page laissée ouverte sans navigation ne constitue pas une nouvelle visite le lendemain.
- Le bouton manuel utilise la dernière session My détectée. Si elle a expiré, ouvrir ou recharger My pour que le site renouvelle sa connexion.

Le **refresh token My n’est pas enregistré ni utilisé par l’extension**. Le token d’accès est lu depuis le stockage de la page ; le site My gère sa propre reconnexion et son renouvellement. Aucun endpoint de renouvellement My n’a été supposé.

## Période et semestres

Dates vides : du 1er septembre au 31 août de l’année scolaire indiquée par My. Les semaines sont interrogées successivement, puis tous les événements sont validés avant les premières écritures Google.

Semestres vide : celui de la session My. Saisir `1,2` pour demander les deux si ton compte y a accès. L’extension ne peut pas importer des cours encore non publiés ou inaccessibles à ton compte.

Après avoir modifié les dates, semestres ou couleurs, utiliser **Synchroniser maintenant** pour appliquer les changements le jour même.

## Informations, catégories et couleurs

Chaque événement conserve :

- Titre et horaires réels de séance (`startDate` / `endDate`), avec fuseau Europe/Paris.
- Module, description, salles et intervenants lorsqu’ils sont renseignés.
- Tous les champs de la réponse My, dans la section **Données complètes My** de sa description Google.
- Code du module dans le titre, désactivable dans les réglages.
- Couleur Google configurable par module, avec une couleur stable pour les nouveaux modules.

L’API fournie ne renvoie pas les couleurs de l’interface ni une catégorie explicite. Les catégories sont ici les modules (`unitCode` / `unitName`), pas les labels natifs de Google. Le JSON des couleurs accepte les IDs Google 1 à 11 ou une couleur `#RRGGBB`, convertie vers la couleur Google disponible la plus proche. La palette est limitée ; plusieurs modules peuvent partager une couleur.

Couleurs par défaut :

| Module | Couleur demandée |
|---|---|
| Graphique — `G-MUL-100` | Rose (Google 4) |
| PSU — `G-PSU-100` | `#013afb` |
| Maths — `G-MAT-100` | `#013afb` |
| Anglais — `G-ENG-100` | `#e03131` |
| CPE — `G-CPE-110` | `#01ca7a` |
| Administratif — `S-ADM-000` | `#099268` |

À la mise à jour, les anciennes couleurs par défaut enregistrées sont remplacées par cette palette. Les couleurs personnalisées qui diffèrent des anciens défauts sont conservées. Cliquer **Synchroniser maintenant** pour recolorer les événements déjà importés.

## Ce qui est synchronisé

L’extension crée les événements absents et actualise ceux dont les données My ont changé. Un identifiant stable et des propriétés privées évitent les doublons à la relance et après une interruption. Elle ne supprime jamais les événements disparus de My, conformément à un fonctionnement de copie/enregistrement.

Elle ne modifie pas My, n’inscrit à aucune activité et n’invite aucun intervenant. Une modification faite dans Google n’est pas envoyée à My ; les champs gérés peuvent être remplacés lors d’une modification ultérieure des données source.

La réponse planning contient des activités facultatives et des compteurs collectifs d’inscriptions. Elle ne donne pas ton inscription personnelle : l’extension importe donc le planning accessible sans prétendre filtrer les seules activités auxquelles tu es inscrit.

Pour une soutenance à créneaux, l’horaire importé est le créneau global du planning. Ton sous-créneau personnel nécessite une autre réponse API. Les plages `activityStartDate` / `activityEndDate` ne remplacent pas les horaires de séance. Les occurrences sont importées comme événements datés, sans reconstituer de règles de récurrence.

Cette extension gère un nouvel agenda ; elle ne reprend pas les événements créés précédemment par le programme Python. Désactiver ou supprimer l’ancien agenda de copie si tu l’avais déjà utilisé, pour ne pas afficher deux copies.

## Stockage et permissions

Les tokens My et Google, le client OAuth, les réglages et les identifiants d’agenda restent dans le stockage local de cette extension, dans ton profil Firefox ; ils ne sont pas placés dans Firefox Sync. Le stockage local n’est pas un coffre chiffré indépendant du profil.

Les requêtes de session My vont uniquement à My Epitech. Les événements et leurs informations sont copiés vers le compte Google que tu autorises. Le token My n’est jamais envoyé à Google et les tokens Google ne sont jamais envoyés à My. Le token My et le refresh token fournis dans la conversation ne sont inclus dans aucun fichier de cette archive.

Permissions : stockage local, identité OAuth, accès à `my.epitech.eu`, aux API Google et au service de renouvellement OAuth Google. Le script de page ne s’exécute que sur My. Les interfaces de réglages reçoivent des indicateurs de connexion et les adresses des comptes, sans recevoir les tokens. Déconnecter Google efface l’autorisation locale ; pour la révoquer aussi chez Google, utiliser les [connexions du compte Google](https://myaccount.google.com/connections).

## CI, builds et releases

Le workflow `.github/workflows/ci.yml` s’exécute sur chaque push de `main`, sur les pull requests, sur les tags `v*` et manuellement depuis Actions.

1. Vérifie la syntaxe JavaScript/Bash, lance ShellCheck et les tests Node/Python.
2. Construit une archive reproductible à partir d’une liste explicite des neuf fichiers de l’extension. Les identifiants locaux, scripts, tests et fichiers CI ne sont jamais empaquetés.
3. Valide le paquet avec `web-ext lint`.
4. Sur un tag, signe le paquet si les deux secrets Mozilla sont configurés.
5. Calcule `SHA256SUMS` et publie les fichiers en artefact Actions. Sur un tag valide, crée également une GitHub Release avec ces fichiers.

### Publier une version

Le tag doit correspondre exactement à la version de `manifest.json`. Pour la première release avec le manifeste actuel :

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Pour la suivante, modifier d’abord la version du manifeste, committer et pousser, puis créer le tag correspondant (ex. `v1.0.1`). Une release déjà existante n’est pas écrasée. Le workflow de publication doit disposer de l’autorisation `contents: write`, déclarée uniquement sur son job de release.

Chaque release contient :

| Fichier | Usage |
|---|---|
| `sync-calendar-epitech-VERSION.zip` | Chargement temporaire / sources exécutables |
| `sync-calendar-epitech-VERSION-unsigned.xpi` | Paquet de développement, non installable durablement dans Firefox standard |
| `sync-calendar-epitech-VERSION.xpi` | Paquet signé, uniquement si Mozilla l’a signé avec succès |
| `install.sh` | Installateur Bash |
| `SHA256SUMS` | Vérification des fichiers téléchargés |

Les sommes SHA-256 vérifient la cohérence avec les fichiers publiés dans la même release. Firefox vérifie lui-même la signature cryptographique du XPI lors de l’installation.

### Activer la signature Mozilla

Obtenir les identifiants API sur [addons.mozilla.org](https://addons.mozilla.org/developers/addon/api/key/), puis ajouter dans **Settings → Secrets and variables → Actions** du dépôt :

- `AMO_JWT_ISSUER` : l’émetteur JWT Mozilla.
- `AMO_JWT_SECRET` : le secret JWT Mozilla.

La CI utilise le canal **unlisted** : signature pour distribution depuis GitHub, sans publication dans le catalogue public AMO. Sans ces deux secrets, les releases de développement sont publiées normalement. Si une seule clé est renseignée, ou si la signature échoue, la release échoue au lieu de présenter un paquet comme signé. Le premier dépôt et les versions suivantes restent soumis aux contrôles Mozilla.

Les clés Mozilla ne sont pas fournies par ce projet et ne doivent jamais être committées. Aucune signature n’a été exécutée depuis cet environnement.

### Vérifier localement

```bash
node --test test.cjs
python3 -m unittest discover -s scripts -p 'test_*.py' -v
bash -n install.sh
shellcheck install.sh
python3 scripts/build.py
npx --yes --package=web-ext@10.5.0 web-ext lint --source-dir dist/extension --no-input
```

## Vérification et limites de validation

Les tests Node couvrent la lecture du stockage `@account`, le jour à Paris, les plages de dates, les détails des événements, les couleurs, les visites simultanées, l’import quotidien, le forçage, les mises à jour et les erreurs de session. Les services Firefox, My et Google sont simulés dans ces tests.

```bash
node --test test.cjs
```

La syntaxe des scripts et les fichiers du manifeste ont également été vérifiés. Aucune connexion OAuth Google réelle ni installation dans Firefox n’a été effectuée dans cet environnement. Le fonctionnement de bout en bout reste à valider après l’import de ton client OAuth et ton autorisation. Le format des événements est basé sur la réponse réelle My vérifiée lors du programme précédent.

Références : [OAuth Firefox et redirection locale](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity), [OAuth Google Desktop et PKCE](https://developers.google.com/identity/protocols/oauth2/native-app), [API Calendar](https://developers.google.com/workspace/calendar/api/v3/reference/events), [installation temporaire Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
