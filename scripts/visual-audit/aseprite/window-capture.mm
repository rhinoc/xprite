// Reference-only Lua C function. Captures this process's own NSWindow view tree.
// No screen/window-server capture, other-process access, or runtime demo dependency.
#import <Cocoa/Cocoa.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
struct lua_State;
static NSWindow* referenceConfiguredWindow = nil;
static NSDictionary* inspectReferenceView(NSView* view, NSView* root, NSUInteger depth) {
  NSRect rect = [root convertRect:view.bounds fromView:view];
  NSMutableDictionary* info = [@{ @"class": NSStringFromClass(view.class),
    @"frameInRoot": @[@(rect.origin.x), @(rect.origin.y), @(rect.size.width), @(rect.size.height)],
    @"flipped": @(view.isFlipped), @"hidden": @(view.isHidden) } mutableCopy];
  if ([view isKindOfClass:NSTextField.class]) {
    NSTextField* field = (NSTextField*)view;
    NSFont* font = field.font;
    info[@"text"] = field.stringValue ?: @"";
    if (font) info[@"font"] = @{ @"name": font.fontName, @"family": font.familyName ?: @"",
      @"pointSize": @(font.pointSize), @"ascender": @(font.ascender), @"descender": @(font.descender),
      @"leading": @(font.leading), @"weight": @([[NSFontManager sharedFontManager] weightOfFont:font]),
      @"traits": @([[NSFontManager sharedFontManager] traitsOfFont:font]) };
    NSColor* color = [field.textColor colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    if (color) info[@"sRGBTextColor"] = @[@(color.redComponent), @(color.greenComponent), @(color.blueComponent), @(color.alphaComponent)];
    NSRect drawRect = [field.cell drawingRectForBounds:field.bounds];
    NSRect titleRect = [field.cell titleRectForBounds:field.bounds];
    info[@"cellDrawingRect"] = @[@(drawRect.origin.x), @(drawRect.origin.y), @(drawRect.size.width), @(drawRect.size.height)];
    info[@"cellTitleRect"] = @[@(titleRect.origin.x), @(titleRect.origin.y), @(titleRect.size.width), @(titleRect.size.height)];
    if (font) {
      NSDictionary* traits = [font.fontDescriptor objectForKey:NSFontTraitsAttribute];
      if (traits) info[@"fontDescriptorTraits"] = traits;
      info[@"fontDisplayName"] = font.displayName ?: @"";
    }
    if (field.attributedStringValue.length) {
      NSFont* attributedFont = [field.attributedStringValue attribute:NSFontAttributeName atIndex:0 effectiveRange:nil];
      if (attributedFont) info[@"attributedFont"] = @{ @"name": attributedFont.fontName, @"pointSize": @(attributedFont.pointSize),
        @"traits": [attributedFont.fontDescriptor objectForKey:NSFontTraitsAttribute] ?: @{} };
    }
    info[@"firstBaselineOffsetFromTop"] = @(field.firstBaselineOffsetFromTop);
    info[@"lastBaselineOffsetFromBottom"] = @(field.lastBaselineOffsetFromBottom);
    info[@"alignment"] = @(field.alignment);
    info[@"bezeled"] = @(field.isBezeled);
    info[@"drawsBackground"] = @(field.drawsBackground);
  }
  if (depth < 16) {
    NSMutableArray* children = [NSMutableArray array];
    for (NSView* child in view.subviews) [children addObject:inspectReferenceView(child, root, depth + 1)];
    if (children.count) info[@"children"] = children;
  }
  return info;
}
extern "C" __attribute__((visibility("default"))) int configure_reference_window(lua_State*) {
  @autoreleasepool {
    NSWindow* window = NSApp.mainWindow;
    if (!window) {
      NSArray<NSWindow*>* candidates = [NSApp.windows filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSWindow* candidate, NSDictionary*) {
        return candidate.canBecomeMainWindow && candidate.contentView != nil;
      }]];
      if (candidates.count == 1) window = candidates.firstObject;
    }
    if (!window) { std::fprintf(stderr, "No own main window for client-size setup\n"); return 0; }
    // A titled window is constrained by Cocoa's screen/titlebar reservation.
    // Client-only reference mode owns this temporary window and removes only
    // its OS decorations before sizing the content surface; Aseprite UI remains.
    referenceConfiguredWindow = window;
    [window setStyleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskResizable];
    [window setContentSize:NSMakeSize(1920, 1050)];
    [window setFrame:NSMakeRect(0, 0, 1920, 1050) display:YES];
    [window.contentView layoutSubtreeIfNeeded];
    std::fprintf(stderr, "Own client-size setup: %.0fx%.0f points\n", window.contentView.bounds.size.width, window.contentView.bounds.size.height);
  }
  return 0;
}
extern "C" __attribute__((visibility("default"))) int capture_reference_window(lua_State*) {
  @autoreleasepool {
    const char* output = std::getenv("ASEPRITE_REFERENCE_WINDOW_OUTPUT");
    if (!output || !*output) { std::fprintf(stderr,"Reference output not configured\n"); return 0; }
    const char* documentName = std::getenv("ASEPRITE_REFERENCE_DOCUMENT_NAME");
    if (!documentName || !*documentName) { std::fprintf(stderr,"Reference document name not configured\n"); return 0; }
    NSString* documentTitle = [NSString stringWithFormat:@"%s - Aseprite", documentName];
    NSWindow* selected = nil;
    for (NSWindow* window in NSApp.windows) {
      if ([window.title containsString:documentTitle]) { selected = window; break; }
    }
    // Home removes the document prefix from the title. NSApp.mainWindow belongs
    // to this isolated process; never discover another application's window.
    if (!selected) selected = referenceConfiguredWindow ?: NSApp.mainWindow;
    if (!selected) { std::fprintf(stderr,"No fixture or main window found in this process\n"); return 0; }
    const char* scope = std::getenv("ASEPRITE_REFERENCE_SCOPE");
    const bool clientOnly = scope && std::strcmp(scope, "client") == 0;
    NSView* frame = clientOnly ? selected.contentView : selected.contentView.superview;
    if (!frame) { std::fprintf(stderr,"No Aseprite frame view\n"); return 0; }
    [frame layoutSubtreeIfNeeded];
    NSPoint mouseInWindow = selected.mouseLocationOutsideOfEventStream;
    NSPoint mouseInFrame = [frame convertPoint:mouseInWindow fromView:nil];
    NSPoint screenMouse = NSEvent.mouseLocation;
    NSDictionary* metadata = @{ @"captureScope": clientOnly ? @"client" : @"window",
      @"captureBounds": @[@(frame.bounds.size.width), @(frame.bounds.size.height)],
      @"mouseInWindow": @[@(mouseInWindow.x), @(mouseInWindow.y)],
      @"mouseInFrameTopOrigin": @[@(mouseInFrame.x), @(frame.bounds.size.height - mouseInFrame.y)],
      @"mouseInScreen": @[@(screenMouse.x), @(screenMouse.y)],
      @"title": selected.title ?: @"", @"keyWindow": @(selected.isKeyWindow),
      @"mainWindow": @(selected.isMainWindow), @"backingScaleFactor": @(selected.backingScaleFactor),
      @"viewTree": inspectReferenceView(frame, frame, 0) };
    NSData* metadataJson = [NSJSONSerialization dataWithJSONObject:metadata options:0 error:nil];
    if (metadataJson) std::fprintf(stderr, "ASEPRITE_WINDOW_VIEW_METADATA:%s\n", [[NSString alloc] initWithData:metadataJson encoding:NSUTF8StringEncoding].UTF8String);

    NSBitmapImageRep* bitmap = [frame bitmapImageRepForCachingDisplayInRect:frame.bounds];
    if (!bitmap) { std::fprintf(stderr,"Cannot allocate Aseprite view bitmap\n"); return 0; }
    [frame cacheDisplayInRect:frame.bounds toBitmapImageRep:bitmap];
    NSData* png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    const BOOL saved = [png writeToFile:[NSString stringWithUTF8String:output] atomically:YES];
    std::fprintf(stderr,"Aseprite own-window capture: %s %ldx%ld frame %.0fx%.0f\n",saved?"saved":"failed",(long)bitmap.pixelsWide,(long)bitmap.pixelsHigh,frame.bounds.size.width,frame.bounds.size.height);
  }
  return 0;
}

// Only used after both capture PNGs were successfully written in the isolated
// child. MaskByColor holds a ContextReader through its modal loop: attempting
// to close/switch the screenshot document from a nested timer can deadlock.
// No teardown or document save is required for this disposable private profile.
extern "C" int finish_reference_capture(lua_State*) {
  std::fprintf(stderr, "ASEPRITE_REFERENCE_CAPTURE_COMPLETE: own child exit after successful PNG writes\n");
  std::fflush(nullptr);
  std::_Exit(0);
}
