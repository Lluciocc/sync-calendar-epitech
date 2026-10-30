# My Epitech → Google Calendar pour Firefox

Extension Firefox 142+ pour ordinateur, sans Python, serveur ni abonnement. Elle récupère la session My dans `@account` et copie le planning dans un agenda Google dédié.

## Installation rapide

1. Décompresser cette archive dans un dossier conservé sur ton ordinateur.
2. Dans Firefox, ouvrir **about:debugging#/runtime/this-firefox**.
3. Cliquer **Charger un module complémentaire temporaire** et sélectionner **manifest.json**.
4. Ouvrir le bouton de l’extension → **Connexions et réglages**.
5. Importer le JSON OAuth Google, puis cliquer **Connecter Google** (configuration ci-dessous).
6. Ouvrir **https://my.epitech.eu/planning** en étant connecté. La session est détectée sans copier de token.

Pour appliquer immédiatement une modification ou relancer un import : bouton **Synchroniser maintenant**, dans le panneau de l’extension ou les réglages.

**Installation temporaire :** Firefox retire les extensions temporaires au redémarrage. Ce paquet n’est pas signé. Pour l’installer durablement dans Firefox standard, il faut le faire signer, éventuellement en distribution non répertoriée, sur [addons.mozilla.org](https://addons.mozilla.org/developers/). L’archive est directement structurée pour cela, avec `manifest.json` à sa racine. La signature et la publication n’ont pas été effectuées. Le nom d’extension et son identifiant sont stables ; garder le stockage de l’extension pour conserver l’agenda cible. Une désinstallation ou une perte de ce stockage peut entraîner la création d’un nouvel agenda à la réinstallation.

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

## Vérification et limites de validation

Les tests Node couvrent la lecture du stockage `@account`, le jour à Paris, les plages de dates, les détails des événements, les couleurs, les visites simultanées, l’import quotidien, le forçage, les mises à jour et les erreurs de session. Les services Firefox, My et Google sont simulés dans ces tests.

```bash
node --test test.cjs
```

La syntaxe des scripts et les fichiers du manifeste ont également été vérifiés. Aucune connexion OAuth Google réelle ni installation dans Firefox n’a été effectuée dans cet environnement. Le fonctionnement de bout en bout reste à valider après l’import de ton client OAuth et ton autorisation. Le format des événements est basé sur la réponse réelle My vérifiée lors du programme précédent.

Références : [OAuth Firefox et redirection locale](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity), [OAuth Google Desktop et PKCE](https://developers.google.com/identity/protocols/oauth2/native-app), [API Calendar](https://developers.google.com/workspace/calendar/api/v3/reference/events), [installation temporaire Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
