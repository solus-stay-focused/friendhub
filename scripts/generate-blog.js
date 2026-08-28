name: Generate Blog

on:
  # Adjust to match your existing triggers — e.g. a schedule, or a
  # repository_dispatch fired when a post is published in Firestore.
  workflow_dispatch:
  schedule:
    - cron: '0 * * * *'   # example: hourly — change/remove as needed

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Generate blog pages
        run: node scripts/generate-blog.js

      - name: Commit and push if changed
        run: |
          git config user.name "friendhub-blog-bot"
          git config user.email "friendhub-blog-bot@users.noreply.github.com"
          git add blog/ sitemap.xml
          git diff --quiet && git diff --staged --quiet || git commit -m "chore: regenerate blog pages"
          git push

      # ---------------------------------------------------------------
      # THIS STEP WAS MISSING — without it, the generated files get
      # committed to the repo but never actually reach your live site.
      # ---------------------------------------------------------------
      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_FRIENDHUB_9F934 }}'
          channelId: live
          projectId: friendhub-9f934
