# WiZ

Pilotez vos lampes et prises connectées [WiZ](https://www.wizconnected.com)
depuis Gladys, sur votre réseau local : ampoules, ampoules à filament, rubans
LED, lampes et prises vendues sous les marques WiZ et Philips Smart LED Wi-Fi.
Marche et arrêt, luminosité, couleur, nuances de blanc et scènes WiZ (Océan,
Romance, Coucher de soleil, Fête, Cheminée…), avec un widget de tableau de
bord, un déclencheur et une action de scène. Ni compte ni cloud : Gladys parle
directement à chaque appareil, comme l'application WiZ sur votre Wi-Fi.

> **Développée sans le matériel : vos retours sont les bienvenus.** Cette
> intégration a été construite et testée sur de vraies réponses d'appareils
> WiZ enregistrées par le projet pywizlight, et sur un appareil simulé, pas
> sur une vraie ampoule. Si quelque chose ne marche pas comme décrit,
> dites-le sur le [forum Gladys](https://community.gladysassistant.com) ou
> dans les [issues](https://github.com/guim31/gladys-wiz/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Des lampes ou prises WiZ déjà installées dans l'**application WiZ**,
  connectées au même réseau que Gladys.
- Dans l'application WiZ, **Paramètres** → **Sécurité** : **Autoriser la
  communication locale** (_Allow local communication_) activé (sans cela, les
  appareils ignorent Gladys).
- Rien d'autre : ni compte WiZ, ni clé, ni accès à internet.

## Installation

1. Installez l'intégration depuis le catalogue de Gladys.
2. Ouvrez sa **Configuration**. Rien n'est obligatoire ; les options sont :
   - **Adresses IP des appareils WiZ** : seulement pour les appareils que la
     découverte automatique ne trouve pas, séparées par des virgules (par
     exemple `192.168.1.50, 192.168.1.51`). Votre box liste l'adresse de
     chaque appareil ; l'application WiZ l'affiche aussi, dans les paramètres
     de l'appareil.
   - **Intervalle d'actualisation** : fréquence de lecture de chaque appareil,
     de 5 à 60 secondes (15 par défaut). C'est le délai avant que Gladys voie
     un changement fait depuis l'application WiZ, une télécommande ou un
     interrupteur mural.
   - **Langue des noms des appareils** : anglais, français, allemand ou
     espagnol (français par défaut). Les noms d'un appareil, de ses
     fonctionnalités et de ses scènes WiZ sont donnés à son ajout.
3. Ouvrez l'onglet **Découverte** : un appareil par lampe ou prise WiZ.
   Cliquez sur **Ajouter**, choisissez une pièce, enregistrez.
4. Il manque un appareil ? Cliquez sur **Rechercher les appareils WiZ** dans
   l'écran de configuration : le message sous le bouton liste les appareils
   trouvés et ceux qui ne répondent pas.

Gladys trouve les appareils en demandant au réseau « qui est un appareil
WiZ ? » (une diffusion sur le port UDP 38899, envoyée par Gladys elle-même :
c'est l'autorisation demandée à l'installation), puis parle directement à
chacun. Un appareil qui change d'adresse est retrouvé en 15 minutes au plus,
sans nouvel appareil dans Gladys : il est identifié par son adresse MAC.

## Les appareils dans Gladys

Chaque lampe ou prise devient un appareil Gladys nommé d'après son type et la
fin de son adresse MAC, par exemple _WiZ couleur 06033D_, _WiZ blanc réglable
5A067C_, _WiZ variable 2054E3_ ou _WiZ prise 9906B7_. Renommez-le à votre
guise. Seul ce que le modèle sait faire est publié :

| Fonctionnalité         | Ce que c'est                                                       | Appareils                          |
| ---------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| Éclairage              | Marche / arrêt                                                     | Toutes les lampes                  |
| Prise                  | Marche / arrêt                                                     | Prises                             |
| Luminosité             | 10 à 100 % ; 0 éteint la lampe                                     | Toutes les lampes                  |
| Couleur                | La couleur d'une lampe couleur                                     | Ampoules et rubans couleur         |
| Température de couleur | Le blanc, en kelvins, dans la plage du modèle (2200 à 6500 K)      | Lampes couleur et blanc réglable   |
| Scène WiZ              | La scène WiZ en cours, ou _Aucune_ ; en choisir une la lance       | Lampes qui ont des scènes          |
| Vitesse de la scène    | Rythme des scènes animées, 10 à 200 % (100 est la vitesse normale) | Lampes qui ont des scènes          |
| Puissance consommée    | Watts consommés par ce qui est branché                             | Prises avec mesure de consommation |

- Une lampe couleur propose les 37 scènes WiZ ; une lampe blanc réglable les
  17 scènes de blanc (Cosy, Réveil, Coucher, Blanc chaud, Lumière du jour,
  Concentration, Détente, Bougie…) ; une ampoule à filament les 8 qu'elle
  sait jouer (Veilleuse, Réveil, Coucher, Bougie…). La liste suit la langue de
  la configuration.
- Choisir une luminosité, une couleur, un blanc ou une scène allume aussi la
  lampe. Choisir _Aucune_ dans la liste des scènes ne fait rien : pour quitter
  une scène, choisissez une couleur ou un blanc.
- Quand une lampe ne répond plus, Gladys l'affiche éteinte et son badge
  indique qu'elle est injoignable : le plus souvent, son interrupteur mural a
  été coupé.

## Widget de tableau de bord

Ajoutez le widget **WiZ** à un tableau de bord et choisissez un appareil dans
ses réglages. Il affiche la luminosité (ou la puissance consommée d'une prise
avec mesure), si l'appareil est allumé, ce que montre la lampe (une scène, un
blanc avec sa température, ou une couleur), et des boutons :

- jusqu'à trois **boutons de scènes**, choisis dans les réglages du widget
  (par défaut Blanc chaud, Détente et Veilleuse). Seules les scènes que la
  lampe sait jouer sont affichées ; celle en cours porte une coche ;
- un bouton **Allumer** / **Éteindre**, qui bascule l'appareil quel que soit
  l'état affiché par le widget.

## Scènes

### Déclencheur

**Appareil WiZ allumé ou éteint hors de Gladys** : une lampe ou une prise WiZ
a été allumée ou éteinte sans Gladys. Filtres :

- **Appareil WiZ** : un appareil, ou n'importe lequel ;
- **Allumé ou éteint** : allumé, éteint, ou les deux ;
- **Depuis** : **Application WiZ, télécommande ou programme** (l'application
  WiZ, une télécommande WiZ, un programme ou un rythme de l'application, un
  assistant vocal), ou **Interrupteur mural ou coupure de courant**
  (l'appareil a cessé de répondre alors qu'il était allumé, ou répond de
  nouveau et s'allume, comme le font les lampes WiZ remises sous tension).

Les variables du déclencheur donnent le nouvel état (`on` ou `off`) et son
origine (`wiz` ou `power`). Une commande envoyée par Gladys ne déclenche
jamais ce déclencheur.

### Action

**Lancer une scène WiZ** : allume la lampe et lance l'une de ses scènes WiZ,
choisie dans une liste, avec une luminosité (10 à 100 %) et une vitesse (10 à
200 %) facultatives. L'action échoue si la lampe ne sait pas jouer cette scène
(une scène Fête sur une ampoule blanche, par exemple). Elle transmet le numéro
et le nom de la scène aux actions suivantes.

### Idées de scènes

- **L'interrupteur mural comme bouton** : _Appareil WiZ allumé ou éteint hors
  de Gladys_ sur l'ampoule du salon, allumé, depuis _Interrupteur mural ou
  coupure de courant_ → allumer les autres lampes de la pièce, ou _Lancer une
  scène WiZ_ « Cosy » à 40 %.
- **Réveil en douceur** : chaque jour de semaine à 6 h 45 → _Lancer une scène
  WiZ_ « Réveil » sur l'ampoule de la chambre.
- **Alerte coupure** : _Appareil WiZ allumé ou éteint hors de Gladys_ sur la
  prise du congélateur, éteint, depuis _Interrupteur mural ou coupure de
  courant_ → envoyer un message « La prise du congélateur ne répond plus ».
- **Soirée cosy** : au coucher du soleil → _Lancer une scène WiZ_ « Cheminée
  », luminosité 60, vitesse 80.

## Dépannage

- **Aucun appareil trouvé automatiquement** : vérifiez que les appareils et
  Gladys sont sur le même réseau (même Wi-Fi ou même VLAN ; un réseau invité
  ou un VLAN séparé pour les objets connectés bloque la découverte). Saisissez
  les adresses IP dans la configuration : cela marche d'un réseau à l'autre
  tant que Gladys peut les joindre. Donner une adresse fixe aux appareils dans
  votre box aide aussi.
- **Un appareil trouvé qui ne répond jamais** : vérifiez **Autoriser la
  communication locale** dans l'application WiZ (Paramètres → Sécurité).
- **« ne répond pas »** : l'appareil est coupé au mur, débranché, ou a perdu
  le Wi-Fi. Il revient tout seul dès qu'il répond de nouveau.
- **La couleur dans Gladys diffère un peu de celle choisie dans l'application
  WiZ** : WiZ mélange des LED de couleur et des LED blanches ; Gladys affiche
  la couleur unie la plus proche.
- L'intégration écrit dans ses logs ce qu'elle trouve et ce qui ne répond
  pas : ouvrez les logs de l'intégration depuis l'interface de Gladys.

## Limites

- Les changements faits hors de Gladys (application WiZ, télécommande,
  interrupteur mural) sont vus à la lecture suivante, dans l'intervalle
  d'actualisation. Les appareils WiZ savent aussi envoyer leurs changements
  au fil de l'eau, mais seulement à une adresse de votre réseau, que
  l'intégration n'a pas (elle tourne dans son propre conteneur isolé) : Gladys
  les lit donc, avec une petite requête locale par appareil et par intervalle
  (deux pour une prise avec mesure). Aucun quota, aucun trafic internet.
- Une lampe coupée au mur est détectée après deux lectures sans réponse
  (30 secondes avec l'intervalle par défaut). Une panne de Wi-Fi a le même
  aspect, tout comme un appareil débranché.
- Ventilateurs de plafond avec lampe WiZ : seule la lampe est pilotée, pas le
  ventilateur. Les lampes à double tête sont une seule lampe (la répartition
  entre les deux têtes n'est pas proposée). Le Rythme et les modes
  personnalisés de l'application WiZ ne sont pas proposés. Les détecteurs de
  mouvement et télécommandes WiZ ne sont pas des appareils Gladys.
- Développée sans vrai appareil WiZ : ce qui n'a pas pu être vérifié est
  listé dans le [README](https://github.com/guim31/gladys-wiz#readme).

Cette intégration n'est affiliée ni à WiZ, ni à Signify, ni à Philips.
