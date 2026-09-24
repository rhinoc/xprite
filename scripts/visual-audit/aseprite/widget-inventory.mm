#include "base/debug.h"
#include "app/ui/dynamics_popup.h"
#include "app/ui/filename_field.h"
#include "ui/button.h"
#include "app/ui/button_set.h"
#include "app/ui/configure_timeline_popup.h"
#include "ui/fit_bounds.h"
#include "ui/base.h"
// Aseprite reference widget inventory and explicitly requested capability fixture.
// Public headers/APIs inside the isolated process; no paint/image changes.
#import <Foundation/Foundation.h>
#include "ui/manager.h"
#include "ui/combobox.h"
#include "ui/listbox.h"
#include "ui/listitem.h"
#include "ui/widget.h"
#include "ui/message.h"
#include "app/ui/recent_listbox.h"
#include "app/ui/color_tint_shade_tone.h"
#include "app/ui/app_menuitem.h"
#include "app/ui/key.h"
#include <cxxabi.h>
#include <cstdlib>
#include <cstdio>
#include <typeinfo>
#include <set>
#include <vector>
#include <stdexcept>
#include <string>
struct lua_State;
struct ReferenceVisibilityTarget {ui::Widget* widget;std::string semantic;bool before;};
static std::vector<ReferenceVisibilityTarget> referenceVisibilityTargets;
static NSString* stringValue(const std::string& value) {
  return [[NSString alloc] initWithBytes:value.data() length:value.size() encoding:NSUTF8StringEncoding] ?: @"<invalid UTF8>";
}
static NSDictionary* inspect(ui::Widget* widget, const std::string& path, std::set<ui::Widget*>& visited, size_t depth) {
  if (!widget || depth > 40 || visited.size() > 10000 || !visited.insert(widget).second)
    @throw [NSException exceptionWithName:@"InvalidWidgetTree" reason:@"Cyclic or oversized widget hierarchy" userInfo:nil];
  int status = 0;
  char* demangled = abi::__cxa_demangle(typeid(*widget).name(), nullptr, nullptr, &status);
  NSString* className = [NSString stringWithUTF8String:demangled ? demangled : typeid(*widget).name()];
  std::free(demangled);
  const auto bounds = widget->bounds();
  const auto childCount = widget->children().size();
  std::fprintf(stderr, "WIDGET_ABI_PROBE depth=%zu class=%s bounds=%d,%d,%d,%d children=%zu idlen=%zu textlen=%zu\n", depth, className.UTF8String, bounds.x, bounds.y, bounds.w, bounds.h, childCount, widget->id().size(), widget->text().size());
  if (childCount > 5000 || widget->id().size() > 4096 || widget->text().size() > 65536 || std::abs(bounds.w) > 100000 || std::abs(bounds.h) > 100000)
    @throw [NSException exceptionWithName:@"WidgetABIMismatch" reason:@"Public inline accessor values failed sanity checks" userInfo:nil];

  NSMutableArray* children = [NSMutableArray array];
  size_t index = 0;
  for (auto* child : widget->children()) [children addObject:inspect(child, path + "/" + std::to_string(index++), visited, depth + 1)];
  NSMutableDictionary* item = [@{ @"path": stringValue(path), @"class": className, @"id": stringValue(widget->id()), @"text": stringValue(widget->text()),
    @"bounds": @[@(bounds.x), @(bounds.y), @(bounds.w), @(bounds.h)],
    @"enabled": @(widget->isEnabled()), @"selected": @(widget->isSelected()), @"visible": @(widget->isVisible()), @"children": children } mutableCopy];
  if (auto* menu = dynamic_cast<app::AppMenuItem*>(widget)) {
    NSMutableArray* shortcuts = [NSMutableArray array];
    if (auto key = menu->key()) for (const auto& shortcut : key->shortcuts()) [shortcuts addObject:stringValue(shortcut.toString())];
    item[@"highlighted"] = @(menu->isHighlighted());
    item[@"command"] = stringValue(menu->getCommandId());
    item[@"shortcuts"] = shortcuts;
  }
  return item;
}
struct CapabilityTarget { ui::Widget* widget; std::string semantic; bool previous; };
static std::vector<CapabilityTarget> capabilityTargets;
static NSString* capabilityName(ui::Widget* widget) {
  int status = 0;
  char* value = abi::__cxa_demangle(typeid(*widget).name(), nullptr, nullptr, &status);
  NSString* result = [NSString stringWithUTF8String:value ? value : typeid(*widget).name()];
  std::free(value); return result;
}
static void requireCapability(bool condition, NSString* reason) {
  if (!condition) @throw [NSException exceptionWithName:@"CapabilityPreflight" reason:reason userInfo:nil];
}
static void collectClass(ui::Widget* widget, NSString* name, std::vector<ui::Widget*>& found) {
  if ([capabilityName(widget) isEqualToString:name]) found.push_back(widget);
  for (auto* child : widget->children()) collectClass(child, name, found);
}
static ui::Widget* uniqueClass(ui::Widget* root, NSString* name) {
  std::vector<ui::Widget*> found; collectClass(root, name, found);
  requireCapability(found.size() == 1, [NSString stringWithFormat:@"Expected one %@, got%zu", name, found.size()]);
  return found.front();
}
extern "C" __attribute__((visibility("default"))) int apply_reference_capabilities(lua_State*) {
  @autoreleasepool { @try {
    requireCapability(capabilityTargets.empty(), @"Capability fixture must run once");
    auto* manager = ui::Manager::getDefault();
    requireCapability(manager && manager->bounds().w == 960 && manager->bounds().h == 525, @"Capability ABI/client geometry guard failed");
    auto* context = manager->findChild("contextbar");
    auto* colorbar = manager->findChild("colorbar");
    requireCapability(context && colorbar, @"Missing semantic contextbar/colorbar IDs");
    requireCapability([capabilityName(context) isEqualToString:@"app::ContextBar"] && [capabilityName(colorbar) isEqualToString:@"app::ColorBar"], @"Root widget classes changed");
    std::vector<CapabilityTarget> plan;
    auto add = [&](ui::Widget* widget, const std::string& semantic) {
      requireCapability(widget->isVisible() && widget->isEnabled(), [NSString stringWithFormat:@"Target must initially be visible and enabled: %@", stringValue(semantic)]);
      plan.push_back({widget, semantic, widget->isEnabled()});
    };
    // ColorBar constructor creates visible m_palHBox with edit set then the
    // three-item sort/presets/options ButtonSet. Only presets/options unsupported.
    requireCapability(colorbar->children().size() >= 1, @"ColorBar header missing");
    auto* header = colorbar->children()[0];
    requireCapability([capabilityName(header) isEqualToString:@"ui::HBox"] && header->children().size() == 2, @"ColorBar header structure changed");
    auto* paletteButtons = header->children()[1];
    requireCapability([capabilityName(paletteButtons) isEqualToString:@"app::ButtonSet"] && paletteButtons->children().size() == 3, @"Palette sort/presets/options structure changed");
    add(paletteButtons->children()[1], "colorbar/header/palette-actions/presets");
    add(paletteButtons->children()[2], "colorbar/header/palette-actions/options");
    const char* toolValue = std::getenv("ASEPRITE_REFERENCE_TOOL");
    const std::string tool = toolValue ? toolValue : "";
    const bool expandedFeatures = std::getenv("ASEPRITE_REFERENCE_CAPABILITIES") && std::string(std::getenv("ASEPRITE_REFERENCE_CAPABILITIES")) == "features1-6";
    auto* modes = uniqueClass(context, @"app::ContextBar::SelectionModeField");
    const bool selection = tool == "rectangular_marquee" || tool == "lasso" || (expandedFeatures && (tool=="elliptical_marquee" || tool=="polygonal_lasso" || tool=="magic_wand"));
    requireCapability(modes->isVisible() == selection, @"Active tool/selection visibility mismatch");
    if (selection) {
      requireCapability(modes->children().size() == 4, @"Selection mode item count changed");
      const char* names[] = {"replace", "add", "subtract", "intersect"};
      for (size_t index = 0; index < 4; ++index) {
        requireCapability([capabilityName(modes->children()[index]) isEqualToString:@"app::ButtonSet::Item"], @"Selection item class changed");
        if (index && !expandedFeatures) add(modes->children()[index], std::string("contextbar/selection-mode/") + names[index]);
      }
      auto* transparent = uniqueClass(context, @"app::ContextBar::TransparentColorField");
      requireCapability(transparent->children().size() == 2, @"Transparent color subtree changed");
      add(transparent, "contextbar/transparent-color");
      auto* pivot = uniqueClass(context, @"app::ContextBar::PivotField");
      requireCapability(pivot->children().size() == 1, @"Pivot subtree changed");
      add(pivot, "contextbar/pivot");
      auto* rotation = uniqueClass(context, @"app::ContextBar::RotAlgorithmField");
      requireCapability(rotation->children().size() == 2, @"Rotation combobox subtree changed");
      add(rotation, "contextbar/rotation-algorithm");
      auto* corners = uniqueClass(context, @"app::ContextBar::CornerRadiusField");
      requireCapability(corners->isVisible() == (tool == "rectangular_marquee"), @"Corner radius visibility mismatch");
      if (tool == "rectangular_marquee") { requireCapability(corners->children().size() == 2 && [capabilityName(corners->children()[0]) isEqualToString:@"app::ContextBar::CornerRadiusField::CornerRadiusButton"] && [capabilityName(corners->children()[1]) isEqualToString:@"app::ContextBar::CornerRadiusField::CornerRadiusEntry"], @"Corner radius button/hidden-entry subtree changed"); add(corners, "contextbar/corner-radius"); }
    }
    if (tool == "text") {
      auto* face=uniqueClass(context,@"app::FontEntry::FontFace");
      add(face,"contextbar/text/font-face");
      auto* style=uniqueClass(context,@"app::FontEntry::FontStyle");
      requireCapability(style->children().size()==3 && !style->children()[0]->isEnabled(),@"Text style default structure changed");
      add(style->children()[1],"contextbar/text/italic");
      add(style->children()[2],"contextbar/text/more-options");
      auto* stroke=uniqueClass(context,@"app::FontEntry::FontStroke");
      requireCapability(stroke->children().size()==2 && stroke->children()[0]->children().size()==2 && stroke->children()[0]->children()[0]->isSelected(),@"Text stroke default structure changed");
      add(stroke->children()[0]->children()[1],"contextbar/text/stroke");
      add(stroke->children()[1],"contextbar/text/stroke-width");
    }
    const char* stateValue = std::getenv("ASEPRITE_REFERENCE_STATE");
    if (stateValue && std::string(stateValue) == "layer-properties") {
      auto* dialog = uniqueClass(manager, @"app::LayerPropertiesWindow");
      auto* mode = dialog->findChild("mode");
      auto* userData = dialog->findChild("user_data");
      requireCapability(mode && userData, @"Layer properties capability targets missing");
      if(!expandedFeatures)add(mode, "layer_properties/mode");
      add(userData, "layer_properties/user_data");
    }

    if (stateValue && (std::string(stateValue) == "file-menu" || std::string(stateValue) == "file-export-menu")) {
      std::vector<ui::Widget*> menus; collectClass(manager, @"app::AppMenuItem", menus);
      for (const char* command : {"CloseFile", "CloseAllFiles", "Exit"}) {
        std::vector<app::AppMenuItem*> matches;
        for (auto* widget : menus) {
          auto* item = dynamic_cast<app::AppMenuItem*>(widget);
          if (item && item->isVisible() && item->getCommandId() == command) matches.push_back(item);
        }
        requireCapability(matches.size() == 1, [NSString stringWithFormat:@"Expected one visible File command %s", command]);
        auto* item = matches.front();
        requireCapability(item->parent() && [capabilityName(item->parent()) isEqualToString:@"ui::Menu"] && item->parent()->text() == "&File", @"Command belongs to wrong Aseprite menu");
        requireCapability(item->isEnabled(), @"Implemented File session command must remain enabled");
      }
      // Submenu parents remain enabled even when unsupported descendants will
      // be disabled by another explicitly scoped fixture.
      for (const char* label : {"Open Recent", "Export", "Import", "Scripts"}) {
        size_t matched = 0;
        for (auto* widget : menus) if (widget->isVisible() && widget->text() == label) { requireCapability(widget->isEnabled(), @"Aseprite submenu parent unexpectedly disabled"); ++matched; }
        requireCapability(matched == 1, @"File submenu parent inventory changed");
      }
    }
    if (stateValue && std::string(stateValue) == "new-sprite") {
      auto* dialog = manager->findChild("new_sprite");
      requireCapability(dialog && dialog->isVisible() && [capabilityName(dialog) isEqualToString:@"app::gen::NewSprite"], @"New Sprite dialog missing");
      for (const char* id : {"color_mode", "bg_color"}) {
        auto* group = dialog->findChild(id);
        requireCapability(group && [capabilityName(group) isEqualToString:@"app::ButtonSet"] && group->children().size() == 3 && group->children()[0]->isSelected(), @"New Sprite default group structure/state changed");
        for (size_t item = 1; item < 3; ++item) {
          requireCapability([capabilityName(group->children()[item]) isEqualToString:@"app::ButtonSet::Item"] && !group->children()[item]->isSelected(), @"New Sprite unsupported item class/state changed");
          const std::string name = std::string(id) == "color_mode" ? (item == 1 ? "grayscale" : "indexed") : (item == 1 ? "white" : "black");
          add(group->children()[item], std::string("new_sprite/") + id + "/" + name);
        }
      }
      auto* advanced = dialog->findChild("advanced_check");
      requireCapability(advanced && [capabilityName(advanced) isEqualToString:@"ui::CheckBox"] && !advanced->isSelected(), @"New Sprite advanced state changed");
      add(advanced, "new_sprite/advanced_check");
    }
    if (stateValue && (std::string(stateValue) == "view-menu" || std::string(stateValue) == "view-show-menu")) {
      std::vector<ui::Widget*> menus; collectClass(manager, @"app::AppMenuItem", menus);
      const std::set<std::string> supported = {"Timeline", "Home"};
      const std::set<std::string> expected = {"DuplicateView", "ToggleWorkspaceLayout", "RunCommand", "ShowExtras", "SymmetryMode", "SetLoopSection", "ShowOnionSkin", "AdvancedMode", "FullscreenMode", "FullscreenPreview", "Refresh"};
      std::set<std::string> found;
      for (auto* widget : menus) {
        auto* item = dynamic_cast<app::AppMenuItem*>(widget);
        if (!item || !item->isVisible() || !item->parent() || item->parent()->text() != "&View") continue;
        const auto command = item->getCommandId();
        if (command.empty()) { requireCapability(item->hasSubmenu() && item->isEnabled(), @"View submenu unexpectedly disabled"); continue; }
        if (supported.count(command)) { requireCapability(item->isEnabled(), @"Supported View command disabled"); continue; }
        requireCapability(expected.count(command), @"Unexpected unsupported View command"); found.insert(command); add(item, std::string("view_menu/") + command);
      }
      requireCapability(found == expected, @"View command inventory changed");
    }
    if (stateValue && std::string(stateValue) == "preferences") {
      auto* dialog = manager->findChild("options");
      requireCapability(dialog && dialog->isVisible() && [capabilityName(dialog) isEqualToString:@"app::OptionsWindow"], @"Preferences dialog missing");
      for (const char* id : {"search", "screen_scale", "ui_scale", "language", "show_menu_bar", "show_aseprite_file_dialog", "show_home", "expand_menubar_on_mouseover", "color_bar_entries_separator", "locate_file", "locate_crash_folder"}) {
        auto* widget = dialog->findChild(id);
        requireCapability(widget != nullptr, [NSString stringWithFormat:@"Preferences control missing: %s", id]);
        add(widget, std::string("options/") + id);
      }
      auto* sections = dialog->findChild("section_listbox");
      requireCapability(sections && sections->children().size() == 21, @"Preferences section inventory changed");
      size_t sectionCount = 0;
      for (auto* item : sections->children()) {
        if (item->isVisible() && [capabilityName(item) isEqualToString:@"ui::ListItem"] && item->text() != "General") { add(item, std::string("options/section/") + item->text()); ++sectionCount; }
      }
      requireCapability(sectionCount == 16, @"Preferences unsupported section count changed");
      auto* windows = dialog->findChild("ui_windows");
      requireCapability(windows && windows->children().size() == 2 && windows->children()[0]->isSelected(), @"Preferences window mode changed");
      add(windows->children()[1], "options/ui_windows/multiple");
      auto* variants = dialog->findChild("theme_variants");
      requireCapability(variants && variants->children().size() == 2 && variants->children()[1]->children().size() == 2, @"Preferences theme variants changed");
      const auto& choices = variants->children()[1]->children();
      requireCapability(choices[0]->text() == "Light" && choices[1]->text() == "Dark" && choices[0]->isEnabled() && choices[1]->isEnabled(), @"Preferences theme choices changed");
    }
    // All semantic/type/count/visibility checks above complete before mutations.
    for (auto& target : plan) target.widget->setEnabled(false);
    capabilityTargets = std::move(plan);
    if (stateValue && (std::string(stateValue) == "view-menu" || std::string(stateValue) == "view-show-menu")) {
      std::vector<ui::Widget*> items; collectClass(manager, @"app::AppMenuItem", items);
      for (auto* widget : items) {
        auto* item = dynamic_cast<app::AppMenuItem*>(widget);
        if (item && item->isVisible() && item->parent() && item->parent()->text() == "&View") item->setHighlighted(item->text() == "Show");
      }
    }
  } @catch (NSException* error) { std::fprintf(stderr, "Capability fixture failed: %s\n", error.reason.UTF8String); } }
  return 0;
}
static app::AppMenuItem* openedExportItem = nullptr;
extern "C" __attribute__((visibility("default"))) int open_reference_export_menu(lua_State*) {
  @autoreleasepool { @try {
    auto* manager = ui::Manager::getDefault();
    std::vector<ui::Widget*> items; collectClass(manager, @"app::AppMenuItem", items);
    std::vector<app::AppMenuItem*> found;
    for (auto* widget : items) {
      auto* item = dynamic_cast<app::AppMenuItem*>(widget);
      if (item && item->isVisible() && item->text() == "Export" && item->parent() && item->parent()->text() == "&File") found.push_back(item);
    }
    requireCapability(found.size() == 1 && found.front()->hasSubmenu() && found.front()->isEnabled(), @"Expected unique enabled File Export submenu parent");
    openedExportItem = found.front();
    openedExportItem->openSubmenu();
  } @catch (NSException* error) { std::fprintf(stderr, "Export submenu navigation failed: %s\n", error.reason.UTF8String); } }
  return 0;
}
extern "C" __attribute__((visibility("default"))) int apply_reference_export_capabilities(lua_State*) {
  @autoreleasepool { @try {
    requireCapability(openedExportItem && openedExportItem->hasSubmenuOpened(), @"Export capability fixture requires opened submenu");
    auto* menu = openedExportItem->getSubmenu();
    requireCapability(menu && menu->isVisible() && menu->text() == "&Export" && menu->children().size() == 6, @"Export submenu structure changed");
    for (const auto& target : capabilityTargets) requireCapability(target.semantic.find("file_menu/Export/") != 0, @"Export capability fixture already applied");
    std::vector<CapabilityTarget> plan;
    for (const char* command : {"SaveFileCopyAs", "ExportSpriteSheet", "ExportTileset", "RepeatLastExport"}) {
      std::vector<app::AppMenuItem*> found;
      for (auto* child : menu->children()) if (auto* item = dynamic_cast<app::AppMenuItem*>(child)) if (item->getCommandId() == command) found.push_back(item);
      requireCapability(found.size() == 1 && found.front()->isVisible(), @"Export command inventory changed");
      auto* item = found.front();
      const std::string id = command;
      if (id == "SaveFileCopyAs") requireCapability(item->isEnabled(), @"Export As must remain enabled");
      else if (id == "ExportTileset") requireCapability(!item->isEnabled(), @"Fixture must retain Aseprite's unavailable tileset export state");
      else { requireCapability(item->isEnabled(), @"Unsupported export must initially be enabled for explicit transition"); plan.push_back({item, std::string("file_menu/Export/") + command, item->isEnabled()}); }
    }
    for (auto& target : plan) target.widget->setEnabled(false);
    capabilityTargets.insert(capabilityTargets.end(), plan.begin(), plan.end());
  } @catch (NSException* error) { std::fprintf(stderr, "Export capability fixture failed: %s\n", error.reason.UTF8String); } }
  return 0;
}
static app::AppMenuItem* openedShowItem = nullptr;
extern "C" __attribute__((visibility("default"))) int open_reference_view_show_menu(lua_State*) {
  @autoreleasepool { @try {
    std::vector<ui::Widget*> items; collectClass(ui::Manager::getDefault(), @"app::AppMenuItem", items);
    std::vector<app::AppMenuItem*> found;
    for (auto* widget : items) {
      auto* item = dynamic_cast<app::AppMenuItem*>(widget);
      if (item && item->isVisible() && item->text() == "Show" && item->parent() && item->parent()->text() == "&View") found.push_back(item);
    }
    requireCapability(found.size() == 1 && found.front()->hasSubmenu() && found.front()->isEnabled(), @"Expected unique enabled View Show submenu parent");
    openedShowItem = found.front(); openedShowItem->openSubmenu();
  } @catch (NSException* error) { std::fprintf(stderr, "Show submenu navigation failed: %s\n", error.reason.UTF8String); } }
  return 0;
}
extern "C" __attribute__((visibility("default"))) int apply_reference_view_show_capabilities(lua_State*) {
  @autoreleasepool { @try {
    requireCapability(openedShowItem && openedShowItem->hasSubmenuOpened(), @"Show capability fixture requires opened submenu");
    auto* menu = openedShowItem->getSubmenu();
    requireCapability(menu && menu->text() == "&Show" && menu->children().size() == 9, @"Show submenu structure changed");
    const std::set<std::string> supported = {"ShowLayerEdges", "ShowGrid", "ShowAutoGuides", "ShowBrushPreview"};
    const std::set<std::string> unsupported = {"ShowSelectionEdges", "ShowSlices", "ShowPixelGrid", "ShowTileNumbers"};
    std::set<std::string> found;
    std::vector<CapabilityTarget> plan;
    for (auto* widget : menu->children()) if (auto* item = dynamic_cast<app::AppMenuItem*>(widget)) {
      const auto command = item->getCommandId(); found.insert(command);
      requireCapability(item->isVisible() && item->isEnabled(), @"Show command initially unavailable");
      requireCapability(supported.count(command) || unsupported.count(command), @"Unexpected Show command");
      if (unsupported.count(command)) plan.push_back({item, std::string("view_menu/Show/") + command, true});
    }
    requireCapability(found.size() == 8 && plan.size() == 4, @"Show command inventory changed");
    for (auto& target : plan) target.widget->setEnabled(false);
    capabilityTargets.insert(capabilityTargets.end(), plan.begin(), plan.end());
  } @catch (NSException* error) { std::fprintf(stderr, "Show capability fixture failed: %s\n", error.reason.UTF8String); } }
  return 0;
}
struct HomeChange { ui::Widget* widget; std::string semantic; std::string property; bool previous; };
static std::vector<HomeChange> homeChanges;
static size_t removedRecentFolderCount = 0;
static bool recentFoldersCleared = false;
static ui::Widget* homeRecentFolders = nullptr;
static ui::Widget* homeRecentFiles = nullptr;
static std::string retainedRecentFile;
extern "C" __attribute__((visibility("default"))) int apply_reference_home_layout(lua_State*) {
  @autoreleasepool { @try {
    requireCapability(homeChanges.empty(), @"Home customization must run once");
    auto* manager = ui::Manager::getDefault();
    auto* home = manager->findChild("home_view");
    auto* news = manager->findChild("news_placeholder");
    auto* recovery = manager->findChild("recover_sprites");
    requireCapability(home && news && recovery && home->isVisible(), @"Home semantic widgets unavailable");
    requireCapability(news->isVisible() && recovery->isEnabled(), @"Unexpected initial Home state");
    requireCapability(news->hasAncestor(home) && recovery->hasAncestor(home), @"Home controls belong to wrong subtree");
    auto* statusbar = manager->findChild("statusbar");
    requireCapability(statusbar && [capabilityName(statusbar) isEqualToString:@"app::StatusBar"], @"Home statusbar missing");
    auto* about = uniqueClass(statusbar, @"app::StatusBar::AboutStatusBar");
    auto* aboutLink = uniqueClass(about, @"ui::LinkLabel");
    requireCapability(aboutLink->text() == "Igara Studio" && aboutLink->isVisible() && aboutLink->isEnabled(), @"Home About link semantic state changed");
    auto* folders = uniqueClass(home, @"app::RecentFoldersListBox");
    auto* recentFolders = dynamic_cast<app::RecentFoldersListBox*>(folders);
    requireCapability(recentFolders != nullptr, @"Recent folder class mismatch");
    auto* files = uniqueClass(home, @"app::RecentFilesListBox");
    const char* fixtureName = std::getenv("ASEPRITE_REFERENCE_DOCUMENT_NAME");
    requireCapability(fixtureName && files->children().size() == 1 && files->children()[0]->text() == fixtureName, @"Isolated recent file fixture row changed");
    for (auto* item : folders->children()) requireCapability([capabilityName(item) isEqualToString:@"app::RecentFileItem"], @"Unexpected recent folder item type");
    std::vector<HomeChange> plan = {{news, "home_view/news_placeholder", "visible", news->isVisible()},
      {recovery, "home_view/recover_sprites", "enabled", recovery->isEnabled()},
      {aboutLink, "statusbar/about/Igara Studio", "enabled", aboutLink->isEnabled()}};
    // This mirrors RecentFileItem removal: hide UI items then synchronize the
    // Aseprite RecentFiles model. Rebuild removes them; no pixel masking remains.
    const auto removedItems = folders->children();
    removedRecentFolderCount = removedItems.size();
    for (auto* item : removedItems) item->setVisible(false);
    recentFolders->updateRecentListFromUIItems();
    for (auto* item : removedItems) { folders->removeChild(item); item->deferDelete(); }
    homeRecentFolders = folders;
    homeRecentFiles = files;
    retainedRecentFile = fixtureName;
    news->setVisible(false);
    recovery->setEnabled(false);
    aboutLink->setEnabled(false);
    const char* homeLayout = std::getenv("ASEPRITE_REFERENCE_HOME_LAYOUT");
    if(homeLayout && std::string(homeLayout)=="no-news-no-folders") {
      auto* folderSection=home->findChild("folders_placeholder");
      requireCapability(folderSection && folderSection->isVisible() && folders->hasAncestor(folderSection),@"Home folder section unavailable");
      plan.push_back({folderSection,"home_view/folders_placeholder","visible",true});
      folderSection->setVisible(false);
    }
    homeChanges = std::move(plan);
    // HomeView::onResize restores news visibility from width. Relayout the
    // owning Splitter directly after the explicit user customization instead.
    news->parent()->layout();
    home->invalidate();
  } @catch (NSException* error) { std::fprintf(stderr, "Home customization failed: %s\n", error.reason.UTF8String); } }
  return 0;
}
extern "C" __attribute__((visibility("default"))) int inspect_reference_widgets(lua_State*) {
  @autoreleasepool {
    @try {
      auto* manager = ui::Manager::getDefault();
      if (!manager) { std::fprintf(stderr, "Widget inventory: no own manager\n"); return 0; }
      std::set<ui::Widget*> visited;
      NSDictionary* tree = inspect(manager, "manager", visited, 0);
      NSMutableArray* visibilityChanges=[NSMutableArray array];
      for(const auto& target:referenceVisibilityTargets)[visibilityChanges addObject:@{@"semantic":stringValue(target.semantic),@"oldVisible":@(target.before),@"newVisible":@(target.widget->isVisible()),@"publicOperation":@"Widget::setVisible + ListBox::layout"}];
      const char* requestedState = std::getenv("ASEPRITE_REFERENCE_STATE");
      if (requestedState && std::string(requestedState) == "file-export-menu") requireCapability(openedExportItem && openedExportItem->hasSubmenuOpened(), @"Export submenu did not open");
      if (requestedState && std::string(requestedState) == "view-show-menu") requireCapability(openedShowItem && openedShowItem->hasSubmenuOpened(), @"Show submenu did not open");
      NSMutableArray* changes = [NSMutableArray array];
      for (const auto& target : capabilityTargets) {
        requireCapability(!target.widget->isEnabled(), @"Capability target re-enabled before capture");
        [changes addObject:@{ @"semantic": stringValue(target.semantic), @"class": capabilityName(target.widget),
          @"oldEnabled": @(target.previous), @"newEnabled": @(target.widget->isEnabled()) }];
      }
      const char* expected = std::getenv("ASEPRITE_REFERENCE_CAPABILITIES");
      if (expected && (std::string(expected) == "basic" || std::string(expected) == "features1-6")) requireCapability(changes.count >= 2, @"Basic fixture missing complete mutation report");
      if (expected && std::string(expected) == "basic" && requestedState && std::string(requestedState) == "file-export-menu") {
        size_t exportCount = 0;
        for (const auto& target : capabilityTargets) if (target.semantic.find("file_menu/Export/") == 0) ++exportCount;
        requireCapability(exportCount == 2, @"Export basic capability proof missing");
      }
      if (expected && std::string(expected) == "basic" && requestedState && (std::string(requestedState) == "view-menu" || std::string(requestedState) == "view-show-menu")) {
        const size_t expectedCount = std::string(requestedState) == "view-show-menu" ? 17 : 13;
        requireCapability(changes.count == expectedCount, @"View capability proof incomplete");
      }
      if (homeRecentFolders) {
        recentFoldersCleared = homeRecentFolders->children().empty();
        requireCapability(recentFoldersCleared, @"Recent folders did not clear after Aseprite deferred deletion");
        requireCapability(homeRecentFiles && homeRecentFiles->children().size() == 1 && homeRecentFiles->children()[0]->text() == retainedRecentFile, @"Recent file row was not retained");
      }
      NSMutableArray* layoutChanges = [NSMutableArray array];
      for (const auto& change : homeChanges) {
        const bool current = change.property == "visible" ? change.widget->isVisible() : change.widget->isEnabled();
        requireCapability(!current, @"Home customization reverted before capture");
        [layoutChanges addObject:@{ @"semantic": stringValue(change.semantic), @"property": stringValue(change.property), @"oldValue": @(change.previous), @"newValue": @(current) }];
      }
      const char* homeExpected = std::getenv("ASEPRITE_REFERENCE_HOME_LAYOUT");
      if (homeExpected && (std::string(homeExpected) == "no-news" || std::string(homeExpected)=="no-news-no-folders")) requireCapability(layoutChanges.count == (std::string(homeExpected)=="no-news" ? 3 : 4) && recentFoldersCleared, @"Home customization proof missing");
      NSData* json = [NSJSONSerialization dataWithJSONObject:@{ @"operation": layoutChanges.count ? @"public-home-layout-fixture" : changes.count ? @"public-setEnabled-capability-fixture" : @"read-only",
        @"viewInitialHighlight": (requestedState && (std::string(requestedState) == "view-menu" || std::string(requestedState) == "view-show-menu") && expected && std::string(expected) == "basic") ? @"public MenuItem::setHighlighted: clear original Duplicate View; highlight first enabled Show after capability mask" : @"Aseprite default",
        @"menuNavigation": openedExportItem ? @"File > Export via public MenuItem::openSubmenu" : openedShowItem ? @"View > Show via public MenuItem::openSubmenu" : @"none",
        @"widgetCount": @(visited.size()), @"changes": changes, @"homeLayoutChanges": layoutChanges,
        @"recentFolders": @{ @"cleared": @(recentFoldersCleared), @"removedCount": @(removedRecentFolderCount), @"retainedRecentFile": stringValue(retainedRecentFile), @"publicOperation": @"RecentListBox::updateRecentListFromUIItems -> RecentFiles::setFolders" }, @"tree": tree, @"visibilityChanges": visibilityChanges } options:0 error:nil];
      if (json) std::fprintf(stderr, "ASEPRITE_WIDGET_INVENTORY:%s\n", [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
    } @catch (NSException* error) {
      std::fprintf(stderr, "Widget inventory failed: %s\n", error.reason.UTF8String);
    }
  }
  return 0;
}

// Canonical animation fixture: dispatch pending paints without polling timers.
// Public Manager APIs only; the isolated process exits immediately after capture.
extern "C" __attribute__((visibility("default"))) int flush_reference_initial_selection(lua_State*) {
  auto* manager = ui::Manager::getDefault();
  manager->dontWaitEvents();
  manager->dispatchMessages();
  return 0;
}

// Dispatch a hover through the original selector in the isolated capture
// process. The document and selected foreground color remain untouched.
extern "C" __attribute__((visibility("default"))) int hover_reference_color_selector(lua_State*) {
  @autoreleasepool { @try {
    auto* manager = ui::Manager::getDefault();
    auto* colorbar = manager->findChild("colorbar");
    requireCapability(colorbar, @"Aseprite colorbar missing");
    auto* selector = dynamic_cast<app::ColorTintShadeTone*>(uniqueClass(colorbar, @"app::ColorTintShadeTone"));
    requireCapability(selector && selector->isVisible(), @"Aseprite tint/shade selector missing");
    const char* state = std::getenv("ASEPRITE_REFERENCE_STATE");
    const std::string mode = state ? state : "";
    const auto bounds = selector->bounds();
    requireCapability(bounds.w == 74 && bounds.h == 85, @"Aseprite color selector geometry changed");
    const gfx::Point point(bounds.x + 39,
                           bounds.y + (mode == "color-hover-hue" ? 70 : mode == "color-hover-alpha" ? 78 : 34));
    ui::MouseMessage move(ui::kMouseMoveMessage,
                          ui::PointerType::Cursor,
                          ui::kButtonNone,
                          ui::kKeyNoneModifier,
                          point);
    move.setDisplay(manager->display());
    move.setRecipient(selector);
    selector->sendMessage(&move);
    manager->dontWaitEvents();
    manager->dispatchMessages();
    std::fprintf(stderr, "ASEPRITE_COLOR_HOVER mode=%s position=%d,%d\n", mode.c_str(), point.x, point.y);
  } @catch (NSException* error) {
    std::fprintf(stderr, "Aseprite color hover failed: %s\n", error.reason.UTF8String);
    std::abort();
  } }
  return 0;
}

extern "C" __attribute__((visibility("default"))) int open_reference_layer_mode(lua_State*) {
  @autoreleasepool { @try {
    auto* manager=ui::Manager::getDefault();
    auto* dialog=uniqueClass(manager,@"app::LayerPropertiesWindow");
    auto* combo=dynamic_cast<ui::ComboBox*>(dialog->findChild("mode"));
    requireCapability(combo && combo->isVisible() && combo->isEnabled(),@"Layer Mode combo unavailable");
    combo->openListBox();
    requireCapability(combo->getWindowWidget()!=nullptr,@"Layer Mode popup did not open");
  } @catch(NSException* error) {std::fprintf(stderr,"Layer Mode popup failed: %s\n",error.reason.UTF8String);} }
  return 0;
}

extern "C" __attribute__((visibility("default"))) int open_reference_experimental(lua_State*) {
 @autoreleasepool { @try {
  auto* dialog=ui::Manager::getDefault()->findChild("options");requireCapability(dialog!=nullptr,@"Options not open");
  auto* list=dynamic_cast<ui::ListBox*>(dialog->findChild("section_listbox"));requireCapability(list!=nullptr,@"Options sections missing");
  for(auto* item:list->children())if(item->text()=="Tablet"&&!item->isVisible()){
    referenceVisibilityTargets.push_back({item,"options/section_tablet",false});item->setVisible(true);
  }
  list->layout();
  ui::Widget* found=nullptr;for(auto* item:list->children())if(item->text()=="Experimental")found=item;
  requireCapability(found!=nullptr,@"Experimental item missing");list->selectChild(found);
  requireCapability(dialog->findChild("section_experimental")->isVisible(),@"Experimental section did not open");
 } @catch(NSException* e){std::fprintf(stderr,"Experimental open failed: %s\n",e.reason.UTF8String);} }return 0;
}
static void matchExperimentalLeaves(ui::Widget* widget) {
 if(!widget->isVisible()||widget->id()=="compose_groups")return;
 NSString* name=capabilityName(widget);
 const bool control=[name isEqualToString:@"ui::CheckBox"]||[name isEqualToString:@"ui::Label"]||[name isEqualToString:@"ui::LinkLabel"]||[name isEqualToString:@"ui::ComboBox"]||[name isEqualToString:@"app::ExprEntry"]||[name isEqualToString:@"ui::Slider"];
 if(control&&widget->isEnabled()){capabilityTargets.push_back({widget,std::string("options/experimental/")+widget->id()+"/"+widget->text(),true});widget->setEnabled(false);return;}
 for(auto* child:widget->children())matchExperimentalLeaves(child);
}
extern "C" __attribute__((visibility("default"))) int match_reference_experimental(lua_State*) {
 @autoreleasepool { @try {
  auto* dialog=ui::Manager::getDefault()->findChild("options");requireCapability(dialog!=nullptr,@"Options not open");
  auto* section=dialog->findChild("section_experimental");requireCapability(section&&section->isVisible(),@"Experimental not visible");
  matchExperimentalLeaves(section);
  for(const char* id:{"multiple_windows","new_render_engine","new_blend","native_clipboard","native_file_dialog","tint_shade_tone_hue_with_sat_value","shaders_for_color_selectors","cache_compressed_tilesets","rgbmap_algorithm_selector","best_fit_criteria_selector"}){
    auto* control=dialog->findChild(id);requireCapability(control && control->isVisible(),@"Experimental control ID missing");
    if(control->isEnabled()){capabilityTargets.push_back({control,std::string("options/experimental/")+id,true});control->setEnabled(false);}
  }
  auto* search=dialog->findChild("search");if(search&&search->isEnabled()){capabilityTargets.push_back({search,"options/search",true});search->setEnabled(false);}
  auto* list=dialog->findChild("section_listbox");for(auto* item:list->children())if(item->isVisible()&&[capabilityName(item) isEqualToString:@"ui::ListItem"]&&item->text()!="General"&&item->text()!="Files"&&item->text()!="Tablet"&&item->text()!="Experimental"&&item->isEnabled()){capabilityTargets.push_back({item,std::string("options/section/")+item->text(),true});item->setEnabled(false);}
  requireCapability(dialog->findChild("compose_groups")->isEnabled(),@"Supported compose groups disabled");
 } @catch(NSException* e){std::fprintf(stderr,"Experimental capability matching failed: %s\n",e.reason.UTF8String);} }return 0;
}

extern "C" __attribute__((visibility("default"))) int open_reference_timeline_settings(lua_State*) {
 @autoreleasepool { @try {
  auto* manager=ui::Manager::getDefault();
  auto* timeline=uniqueClass(manager,@"app::Timeline");
  auto* popup=new app::ConfigureTimelinePopup();
  popup->remapWindow();
  const auto frame=timeline->bounds();
  const gfx::Rect gear(frame.x+36,frame.y+15,12,12);
  auto bounds=popup->bounds();
  ui::fit_bounds(manager->display(),ui::BOTTOM,gear,bounds);
  ui::fit_bounds(manager->display(),popup,bounds);popup->openWindow();
 } @catch(NSException* error) {std::fprintf(stderr,"Timeline settings capture failed: %s\n",error.reason.UTF8String);} }
 return 0;
}

static void openReferenceSheetSection(int section) {
 auto* dialog=ui::Manager::getDefault()->findChild("export_sprite_sheet");
 requireCapability(dialog!=nullptr,@"Export sheet dialog missing");
 auto* tabs=dynamic_cast<app::ButtonSet*>(dialog->findChild("section_tabs"));
 requireCapability(tabs!=nullptr,@"Export sheet tabs missing");
 tabs->deselectItems();tabs->setSelectedItem(section);tabs->ItemChange(tabs->getItem(section));
}
extern "C" __attribute__((visibility("default"))) int open_reference_sheet_sprite(lua_State*) {openReferenceSheetSection(1);return 0;}
extern "C" __attribute__((visibility("default"))) int open_reference_sheet_borders(lua_State*) {openReferenceSheetSection(2);return 0;}
extern "C" __attribute__((visibility("default"))) int open_reference_sheet_output(lua_State*) {openReferenceSheetSection(3);return 0;}
extern "C" __attribute__((visibility("default"))) int match_reference_timeline_settings(lua_State*) {
 auto* popup=uniqueClass(ui::Manager::getDefault(),@"app::ConfigureTimelinePopup");
 for(const char* id:{"position","first_frame","thumb_enabled","defaults"}){
  auto* control=popup->findChild(id);requireCapability(control!=nullptr,@"Missing timeline control for capability fixture");
  capabilityTargets.push_back({control,std::string("timeline/settings/")+id,control->isEnabled()});control->setEnabled(false);
 }
 return 0;
}

extern "C" __attribute__((visibility("default"))) int open_reference_sheet_output_expanded(lua_State*) {
 openReferenceSheetSection(3);
 auto* dialog=ui::Manager::getDefault()->findChild("export_sprite_sheet");
 for(const char* id:{"image_enabled","data_enabled"}){auto* check=dynamic_cast<ui::CheckBox*>(dialog->findChild(id));requireCapability(check!=nullptr,@"Output checkbox missing");check->setSelected(true);check->Click();}
 auto* image=dynamic_cast<app::FilenameField*>(dialog->findChild("image_filename"));
 auto* data=dynamic_cast<app::FilenameField*>(dialog->findChild("data_filename"));
 requireCapability(image&&data,@"Output filename fields missing");
 image->setFilename("animation-fixture.png");data->setFilename("animation-fixture.json");
 return 0;
}

extern "C" __attribute__((visibility("default"))) int accept_reference_export_for_gif(lua_State*) {
 auto* dialog=dynamic_cast<ui::Window*>(ui::Manager::getDefault()->findChild("export_file"));
 requireCapability(dialog!=nullptr,@"Export File is not open before GIF options");
 auto* ok=dialog->findChild("ok");requireCapability(ok&&ok->isEnabled(),@"Export button unavailable");
 dialog->closeWindow(ok);return 0;
}

extern "C" __attribute__((visibility("default"))) int open_reference_gradient_dynamics(lua_State*) {
 auto* manager=ui::Manager::getDefault();
 auto* field=dynamic_cast<app::ButtonSet*>(uniqueClass(manager,@"app::ContextBar::DynamicsField"));
 auto* delegate=dynamic_cast<app::DynamicsPopup::Delegate*>(field);requireCapability(delegate!=nullptr,@"Dynamics delegate unavailable");
 auto* popup=new app::DynamicsPopup(delegate);popup->loadDynamicsPref(popup->sharedSettings());popup->setOptionsGridVisibility(true);popup->refreshVisibility();popup->remapWindow();
 const auto bounds=field->bounds();ui::fit_bounds(manager->display(),popup,gfx::Rect(gfx::Point(bounds.x,bounds.y2()),popup->sizeHint()));popup->openWindow();field->getItem(0)->setSelected(true);
 auto* values=dynamic_cast<app::ButtonSet*>(popup->findChild("values"));requireCapability(values&&values->getItem(10),@"Gradient Pressure cell unavailable");values->ItemChange(values->getItem(10));
 return 0;
}
