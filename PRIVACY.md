# Xprite Privacy Notice

[简体中文](PRIVACY.zh.md)

Last updated: October 4, 2026.

This notice describes data used by the Xprite web editor. Xprite does not require an account. A site that embeds or hosts Xprite, such as itch.io, may have its own privacy practices.

## Work stored in your browser

Xprite processes artwork in your browser. Projects, recent files, recovery data, presets and interface preferences may be saved in browser storage or in files you choose. Xprite does not upload artwork for editing or sync it to an account. Clearing the site's browser data may also delete locally saved projects and recovery data; save a copy of important work first.

## Usage data

Production web builds with analytics enabled send usage events to PostHog Cloud in the United States. These events cover page visits, editor readiness, view changes, opening and editing documents, export or download requests, selected interface actions, and sanitized errors. They may include browser and device information, the page path without URL query parameters, document dimensions or format, and approximate location such as country, region or city. They do not include artwork pixels, document names, local file paths, or account details.

PostHog saves a visitor identifier in this browser's `localStorage` to count return visits. It uses the request IP address to add approximate location to new events, then discards the raw IP before storing the event. Person profiles, session recordings and automatic click capture are disabled. Analytics failures do not interrupt the editor.

PostHog retains events according to its [event retention rules](https://posthog.com/docs/data/events-retention). The browser identifier normally remains until you or your browser clear this site's data.

## Your choice

If your browser offers **Do Not Track**, enable it and reopen Xprite to stop future usage reports from this browser. This does not delete earlier reports. Clearing site data also resets the visitor identifier, but may remove locally saved work.

## Questions

For questions about this notice or the data Xprite collects, [contact the maintainer through GitHub Issues](https://github.com/rhinoc/xprite/issues). Do not post personal information or artwork in a public issue; ask for a private contact method if needed.
