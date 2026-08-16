RAMOXN FINAL - GOOGLE DRIVE + GMAIL

Cette version corrige :
- l'affichage des factures dans l'onglet Factures ;
- la génération des PDF facture et attestations ;
- le stockage des PDF dans Google Drive ;
- l'envoi de la facture + attestations au client par Gmail ;
- l'état de connexion Google ;
- la synchronisation du JSON ;
- téléphone + ordinateur.

CONFIGURATION GOOGLE
1. Conserver le Client ID OAuth Web existant.
2. Google Drive API doit être activée.
3. Activer Gmail API dans le même projet Google Cloud.
4. Dans Google Auth Platform > Data Access, ajouter :
   https://www.googleapis.com/auth/drive.file
   https://www.googleapis.com/auth/gmail.send
5. Garder le compte contact.ramoxn@gmail.com comme utilisateur test.
6. Origine JavaScript autorisée : https://ramoxn.github.io
7. Remplacer index.html, css/style.css et js/app.js dans le dépôt GitHub.
8. Recharger RamoXN et refaire la connexion Google pour accepter Gmail.
9. Une facture crée les PDF, les stocke dans Drive et les envoie à l'adresse e-mail du client.

Le mail est envoyé depuis le compte Google connecté via Gmail API. Aucun mot de passe Gmail n'est stocké.
