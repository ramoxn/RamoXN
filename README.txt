RAMOXN + GOOGLE DRIVE
=====================

Cette version est une application web responsive pour téléphone/ordinateur.

1) Héberge le dossier sur un site HTTPS (ou teste avec un serveur local).
2) Dans Google Cloud Console, crée un projet.
3) Active Google Drive API.
4) Configure Google Auth Platform / OAuth.
5) Crée un client OAuth 2.0 de type Application Web.
6) Ajoute l'origine HTTPS de ton site dans "Origines JavaScript autorisées".
7) Copie le Client ID dans RamoXN > Google Drive.
8) Clique "Se connecter".
9) RamoXN créera un dossier "RamoXN" dans ton Drive.
10) Les données sont synchronisées dans RamoXN_data.json et les factures/attestations sont envoyées en PDF.

IMPORTANT :
- Aucun mot de passe Google/Gmail n'est demandé ou stocké dans le code.
- Le navigateur doit être utilisé via HTTPS pour une vraie mise en production.
- Le fichier index.html ne doit pas être ouvert en double-cliquant pour la version Google : utilise un hébergement ou un serveur HTTP.
- Cette version utilise Google Identity Services et l'API Google Drive.
