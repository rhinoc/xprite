# Xprite Privacy Notice

[简体中文](PRIVACY.zh.md)

Last updated: October 7, 2026.

This notice describes data used by the Xprite web editor. Xprite does not require an account. A site that embeds or hosts Xprite, such as itch.io, may have its own privacy practices.

## Work stored in your browser

Xprite processes artwork in your browser. Projects, recent files, recovery data, presets and interface preferences may be saved in browser storage or in files you choose. Xprite does not upload artwork for editing or sync it to an account. Clearing the site's browser data may also delete locally saved projects and recovery data; save a copy of important work first.

The Share command creates a URL containing the compressed editable project in its fragment. Xprite generates and reads this data locally without uploading a share file. Sending the link or QR code through another app shares that project data with the app and its recipients. Anyone with the complete link can open the project; there is no expiration or revocation of those copies.

## Usage data

Production web builds with analytics enabled send usage events to PostHog Cloud in the United States. These events cover page visits, startup stages and readiness, view changes, restoring, opening and editing documents, manual save/export attempts and results, selected interface actions, and sanitized errors. They may include browser and device capabilities, the page path without URL query parameters or fragments, a referring hostname, time the page or editor view was visible, document dimensions or format, and approximate location such as country, region or city. They do not include artwork pixels, document names, local file paths, or account details. Background recovery writes are not recorded as manual saves.

PostHog saves a visitor identifier in this browser's `localStorage` to count return visits. It uses the request IP address to add approximate location to new events, then discards the raw IP before storing the event. Person profiles, session recordings and automatic click capture are disabled. Analytics failures do not interrupt the editor.

Submitting the feedback dialog sends your selected type, written content and optional email to PostHog with the visit context. Unsubmitted drafts remain in memory until the page is reloaded. A failed submission keeps the draft for retry.

PostHog retains events according to its [event retention rules](https://posthog.com/docs/data/events-retention). The browser identifier normally remains until you or your browser clear this site's data.

Comparison links can attach one of three fixed article identifiers (`aseprite-online`, `aseprite-on-ipad` or `piskel-alternatives`) to the current editor visit and its actions. Xprite accepts these identifiers only with the fixed comparison source and referral medium. It does not collect arbitrary campaign values, search keywords or raw URL query/hash parameters, and does not save this attribution for later visits.

## Your choice

If your browser offers **Do Not Track**, enable it and reopen Xprite to stop future usage reports from this browser. This does not delete earlier reports. Clearing site data also resets the visitor identifier, but may remove locally saved work.

## Questions

For questions about this notice or the data Xprite collects, [contact the maintainer through GitHub Issues](https://github.com/rhinoc/xprite/issues). Do not post personal information or artwork in a public issue; ask for a private contact method if needed.
