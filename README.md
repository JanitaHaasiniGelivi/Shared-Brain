# SharedSpace

A Firebase-backed internal web app for a shared visual second brain for video ideas.

## What It Does

- Google sign-in through Firebase Authentication
- Shared Firestore idea library
- Firebase Storage uploads for screenshots and custom thumbnails
- Visual masonry grid with rich cards
- YouTube metadata and thumbnails when available
- Tweet-style, Instagram-style, article, screenshot, and loose-idea previews
- Manual categories with no defaults
- Automatic saved date for each item
- Search and filters
- Editable ideas
- AI title suggestions through an OpenAI-compatible model endpoint
- Copyable agent skill block with a private token

## Local Use

Run the local server, then visit the server URL in a browser.

```bash
node server.js
```

For Firebase, deploy the included `firestore.rules` and `storage.rules` in your Firebase console or CLI.

## Firebase Collections

- `profiles/{uid}`
- `ideas/{ideaId}`
- `agentTokens/{token}`

The app uses the Firebase project `sharedspace-6ac5c`.

## Agent Access Note

The profile modal creates a private agent token and a copyable instruction block. The included rules keep the database available only to authenticated Firebase users. For token-only agent access without Google sign-in, add a Firebase Cloud Function or custom auth flow that validates `agentTokens/{token}` before reading or writing ideas.

