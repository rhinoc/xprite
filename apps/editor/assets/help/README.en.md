# User guide

- [Save and recover](#save-and-recover)
- [Arrange your workspace](#arrange-your-workspace)
- [Show and hide controls](#show-and-hide-controls)
- [Fingers and a pen](#fingers-and-a-pen)
- [Shortcut toolbar](#shortcut-toolbar)
- [Mouse, trackpad and shortcuts](#mouse-trackpad-and-shortcuts)
- [Paste an external image](#paste-an-external-image)
- [Pick a color from the screen](#pick-a-color-from-the-screen)
- [Install and use offline](#install-and-use-offline)
- [Report a problem](#report-a-problem)

## Save and recover

Choose a save location in **File → Save As**:

- **Browser** stores the project in the current browser. Reopen it from **Recent files** on Home. Projects do not sync to other devices or browsers.
- **File Manager** saves a file on your device. Browsers that support it open a file save dialog; other browsers save through a download.

![Save location options in Save As.](images/en/save-as.webp)

Clearing site data deletes browser projects and recovery data. Before changing devices or browsers, or clearing data, save the projects you want to keep to **File Manager**.

Use **Recover Files…** on Home to find editing backups. To remove a project's browser data, close the project first, then choose **Delete browser copy** from its Recent files menu. This also removes its recovery backups; the original file on your device is unaffected.

## Arrange your workspace

Use **Workspace layout** beside the document tabs to arrange panels.

![Workspace layout button.](images/shared/layout-button.webp)

- Drag panel handles or tabs and follow the drop guides to dock panels, place them side by side or combine them as tabs.
- Open a panel handle or tab's menu to float it or **Collapse to button**.

**Auto** chooses a layout based on the available window space.

Use **Save current...** to save an arrangement. Changes to a selected saved layout update it; save a new copy first to keep the old arrangement.

![Workspace layout list.](images/en/layout-menu.webp)

## Show and hide controls

Menu bar and toolbar toggles are in **View → Show**.

![View → Show menu.](images/en/view-show.webp)

After hiding the menu bar, use **Menu** on the left of the document tabs to reopen **View → Show**. After hiding the tool options toolbar, click the selected tool to open its settings.

Swipe along the tool rail to reach tools that do not fit. A horizontal rail also supports mouse wheel and trackpad scrolling.

## Fingers and a pen

Default gestures:

- **Drag with two fingers** to pan the canvas.
- **Pinch with two fingers** to zoom. Zoom snaps to a zoom level on release.
- **Tap with two fingers** to undo.
- **Tap with three fingers** to redo.
- **Hold two or three fingers still** to repeat undo or redo.
- **Touch and hold with one finger** to pick a color.

Fingers can draw until you use a pen. After that, fingers pan and the pen draws.

To always draw or pan with fingers, choose a mode in **Edit → Preferences → Touch → Single-finger action**. This section also controls pinch zoom, undo and redo gestures, color picking and hold delays.

![Touch preferences.](images/en/touch-settings.webp)

## Shortcut toolbar

Find it in **View → Show → Shortcut Toolbar**. Direction buttons move a selection one pixel at a time; **Constrain**, **From Center** and **Duplicate Drag** replace the corresponding keyboard modifiers.

![The four buttons for moving a selection.](images/shared/selection-arrows.webp)

![Constrain, Duplicate Drag and From Center, from left to right.](images/shared/selection-modifiers.webp)

With Rectangular Marquee, Elliptical Marquee or Lasso in **Replace** or **Intersect** mode, tap outside the selection to clear it. This also works when fingers are set to pan; dragging still pans the canvas.

## Mouse, trackpad and shortcuts

By default, the mouse wheel zooms the canvas, two-finger trackpad slides pan it, and pinching zooms it.

If device detection is inaccurate, choose **Mouse wheel** or **Trackpad** in **Edit → Preferences → Editor → Wheel device**. Canvas wheel and two-finger slide zoom settings are in the same section.

If your browser or operating system reserves a shortcut, use the menu or Shortcuts panel, or change the binding in **Edit → Keyboard Shortcuts**.

## Paste an external image

Pasting images from another app may require browser clipboard permission.

If pasting fails, open the image as a file, then copy it into the target project within Xprite.

## Pick a color from the screen

Hold **Alt** (**Option** on Mac) and click the foreground or background color button to sample colors outside the editor.

![Foreground and background color buttons.](images/shared/color-buttons.webp)

If your browser does not support screen color picking, open the image in Xprite to sample its colors.

## Install and use offline

**Chrome**: the **Install** icon on the right of the address bar.

![Install button in the Chrome address bar.](images/en/chrome-install-button.webp)

**Safari on Mac**: **File → Add to Dock…**.

**Safari on iPhone or iPad**: **Share → Add to Home Screen**. Share may be inside the **Page Menu**.

Load the features you need while online first. Cached editing, saving and exporting features work offline.

## Report a problem

[GitHub Issues](https://github.com/rhinoc/xprite/issues).

Diagnostic logs can be exported from **Edit → Preferences → Diagnostics** or from the editor error dialog.
