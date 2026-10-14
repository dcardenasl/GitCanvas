//! The macOS menu bar: what it contains, and how that becomes a native menu.
//!
//! The two halves are kept apart on purpose. *What the menu contains* — which
//! items, which chords, which text — is plain data ([`Section`]), built by pure
//! functions and checked by tests anywhere. *Turning it into a native menu*
//! ([`to_native`]) is the thin part that talks to the system, which only allows
//! menus to be built on the main thread and so cannot be exercised by unit tests;
//! it holds no decisions to get wrong.
//!
//! See `commands::menu` for why the application owns its menu.

use tauri::{
    menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

use crate::commands::menu::{MenuAction, MenuLabels};

/// The id of the "open folder" item.
pub const OPEN_FOLDER_ID: &str = "open-folder";
/// The id of the "close tab" item.
pub const CLOSE_TAB_ID: &str = "close-tab";

/// The system's own items the menu uses, which it labels and handles itself.
///
/// None of them closes the window, and that is the point: `⌘W` is "Close Tab".
/// The window closes with the red button and the application with `⌘Q`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Standard {
    About,
    Hide,
    HideOthers,
    ShowAll,
    Quit,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Minimize,
    Zoom,
}

/// One line of a menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Entry {
    /// An item of the application's own, reported to the interface when chosen.
    Item {
        id: &'static str,
        text: String,
        accelerator: &'static str,
    },
    /// A system item, with the text to show or the system's own when `None`.
    Standard(Standard, Option<String>),
    Separator,
}

/// A titled menu of the menu bar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Section {
    pub title: String,
    pub entries: Vec<Entry>,
}

/// The action a menu item stands for, if it is one of ours.
///
/// The standard items (copy, quit, …) are handled by the system and never
/// reach the interface.
pub fn action_for(id: &str) -> Option<MenuAction> {
    match id {
        OPEN_FOLDER_ID => Some(MenuAction::OpenFolder),
        CLOSE_TAB_ID => Some(MenuAction::CloseTab),
        _ => None,
    }
}

fn standard(item: Standard, text: &str) -> Entry {
    Entry::Standard(item, Some(text.to_owned()))
}

/// The menu bar in the language of `labels`.
pub fn full_spec(app_name: &str, labels: &MenuLabels) -> Vec<Section> {
    vec![
        Section {
            title: app_name.to_owned(),
            entries: vec![
                standard(Standard::About, &labels.about),
                Entry::Separator,
                standard(Standard::Hide, &labels.hide),
                standard(Standard::HideOthers, &labels.hide_others),
                standard(Standard::ShowAll, &labels.show_all),
                Entry::Separator,
                standard(Standard::Quit, &labels.quit),
            ],
        },
        Section {
            title: labels.file.clone(),
            entries: vec![
                Entry::Item {
                    id: OPEN_FOLDER_ID,
                    text: labels.open_folder.clone(),
                    accelerator: "CmdOrCtrl+O",
                },
                Entry::Item {
                    id: CLOSE_TAB_ID,
                    text: labels.close_tab.clone(),
                    accelerator: "CmdOrCtrl+W",
                },
            ],
        },
        Section {
            title: labels.edit.clone(),
            entries: vec![
                standard(Standard::Undo, &labels.undo),
                standard(Standard::Redo, &labels.redo),
                Entry::Separator,
                standard(Standard::Cut, &labels.cut),
                standard(Standard::Copy, &labels.copy),
                standard(Standard::Paste, &labels.paste),
                standard(Standard::SelectAll, &labels.select_all),
            ],
        },
        Section {
            title: labels.window.clone(),
            entries: vec![
                standard(Standard::Minimize, &labels.minimize),
                standard(Standard::Zoom, &labels.zoom),
            ],
        },
    ]
}

/// The menu used until the interface has said what language to use.
///
/// It has the system's own items and no File menu, so no chord the interface
/// will take over (`⌘W`, `⌘O`) does something else in the first moments. The
/// text of those items is whatever the platform provides.
pub fn initial_spec(app_name: &str) -> Vec<Section> {
    let system = |item| Entry::Standard(item, None);
    vec![
        Section {
            title: app_name.to_owned(),
            entries: vec![
                system(Standard::Hide),
                system(Standard::HideOthers),
                Entry::Separator,
                system(Standard::Quit),
            ],
        },
        Section {
            title: "Edit".to_owned(),
            entries: vec![
                system(Standard::Undo),
                system(Standard::Redo),
                Entry::Separator,
                system(Standard::Cut),
                system(Standard::Copy),
                system(Standard::Paste),
                system(Standard::SelectAll),
            ],
        },
    ]
}

fn native_entry<R: Runtime>(
    manager: &impl Manager<R>,
    entry: &Entry,
) -> tauri::Result<Box<dyn IsMenuItem<R>>> {
    Ok(match entry {
        Entry::Item {
            id,
            text,
            accelerator,
        } => Box::new(MenuItem::with_id(
            manager,
            *id,
            text,
            true,
            Some(*accelerator),
        )?),
        Entry::Separator => Box::new(PredefinedMenuItem::separator(manager)?),
        Entry::Standard(kind, text) => {
            let text = text.as_deref();
            Box::new(match kind {
                Standard::About => PredefinedMenuItem::about(manager, text, None)?,
                Standard::Hide => PredefinedMenuItem::hide(manager, text)?,
                Standard::HideOthers => PredefinedMenuItem::hide_others(manager, text)?,
                Standard::ShowAll => PredefinedMenuItem::show_all(manager, text)?,
                Standard::Quit => PredefinedMenuItem::quit(manager, text)?,
                Standard::Undo => PredefinedMenuItem::undo(manager, text)?,
                Standard::Redo => PredefinedMenuItem::redo(manager, text)?,
                Standard::Cut => PredefinedMenuItem::cut(manager, text)?,
                Standard::Copy => PredefinedMenuItem::copy(manager, text)?,
                Standard::Paste => PredefinedMenuItem::paste(manager, text)?,
                Standard::SelectAll => PredefinedMenuItem::select_all(manager, text)?,
                Standard::Minimize => PredefinedMenuItem::minimize(manager, text)?,
                Standard::Zoom => PredefinedMenuItem::maximize(manager, text)?,
            })
        }
    })
}

/// Builds the native menu for `spec`. Must run on the main thread.
///
/// # Errors
/// Returns an error if the system refuses an item or the menu.
pub fn to_native<R: Runtime>(
    manager: &impl Manager<R>,
    spec: &[Section],
) -> tauri::Result<Menu<R>> {
    let submenus = spec
        .iter()
        .map(|section| {
            let entries = section
                .entries
                .iter()
                .map(|entry| native_entry(manager, entry))
                .collect::<tauri::Result<Vec<_>>>()?;
            let items: Vec<&dyn IsMenuItem<R>> = entries.iter().map(Box::as_ref).collect();
            Submenu::with_items(manager, &section.title, true, &items)
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let sections: Vec<&dyn IsMenuItem<R>> = submenus
        .iter()
        .map(|submenu| submenu as &dyn IsMenuItem<R>)
        .collect();
    Menu::with_items(manager, &sections)
}

#[cfg(test)]
mod tests {
    use super::{
        action_for, full_spec, initial_spec, Entry, Section, Standard, CLOSE_TAB_ID, OPEN_FOLDER_ID,
    };
    use crate::commands::menu::{MenuAction, MenuLabels};

    /// Labels that are their own names, so any item can be traced to its source.
    fn labels() -> MenuLabels {
        let word = |text: &str| text.to_owned();
        MenuLabels {
            about: word("about"),
            hide: word("hide"),
            hide_others: word("hide-others"),
            show_all: word("show-all"),
            quit: word("quit"),
            file: word("File"),
            open_folder: word("open-folder-text"),
            close_tab: word("close-tab-text"),
            edit: word("Edit"),
            undo: word("undo"),
            redo: word("redo"),
            cut: word("cut"),
            copy: word("copy"),
            paste: word("paste"),
            select_all: word("select-all"),
            window: word("Window"),
            minimize: word("minimize"),
            zoom: word("zoom"),
        }
    }

    fn section<'a>(spec: &'a [Section], title: &str) -> &'a Section {
        spec.iter().find(|section| section.title == title).unwrap()
    }

    #[test]
    fn the_menu_bar_has_the_four_menus_in_the_usual_order() {
        let spec = full_spec("GitCanvas", &labels());

        let titles: Vec<&str> = spec.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(titles, ["GitCanvas", "File", "Edit", "Window"]);
    }

    #[test]
    fn the_file_menu_opens_and_closes_tabs_with_the_standard_chords() {
        let spec = full_spec("GitCanvas", &labels());

        assert_eq!(
            section(&spec, "File").entries,
            [
                Entry::Item {
                    id: OPEN_FOLDER_ID,
                    text: "open-folder-text".to_owned(),
                    accelerator: "CmdOrCtrl+O",
                },
                Entry::Item {
                    id: CLOSE_TAB_ID,
                    text: "close-tab-text".to_owned(),
                    accelerator: "CmdOrCtrl+W",
                },
            ]
        );
    }

    #[test]
    fn no_chord_is_claimed_twice() {
        let spec = full_spec("GitCanvas", &labels());

        let mut chords: Vec<&str> = spec
            .iter()
            .flat_map(|section| &section.entries)
            .filter_map(|entry| match entry {
                Entry::Item { accelerator, .. } => Some(*accelerator),
                _ => None,
            })
            .collect();
        let total = chords.len();
        chords.sort_unstable();
        chords.dedup();
        assert_eq!(chords.len(), total);
    }

    #[test]
    fn the_standard_items_carry_the_interface_language() {
        let spec = full_spec("GitCanvas", &labels());

        let edit: Vec<Option<&str>> = section(&spec, "Edit")
            .entries
            .iter()
            .filter_map(|entry| match entry {
                Entry::Standard(_, text) => Some(text.as_deref()),
                _ => None,
            })
            .collect();
        assert_eq!(
            edit,
            [
                Some("undo"),
                Some("redo"),
                Some("cut"),
                Some("copy"),
                Some("paste"),
                Some("select-all"),
            ]
        );
        assert!(section(&spec, "GitCanvas")
            .entries
            .contains(&Entry::Standard(Standard::Quit, Some("quit".to_owned()))));
    }

    #[test]
    fn the_standard_items_cannot_close_the_window() {
        // `Standard` has no close-window variant, so this cannot be built by
        // accident; the source check keeps it from being added by one.
        let source = include_str!("menu.rs");
        let production = source.split("#[cfg(test)]").next().unwrap();

        assert!(!production.contains("close_window"));
        assert!(!production.contains("CloseWindow"));
    }

    #[test]
    fn the_initial_menu_has_no_file_menu_so_no_chord_does_the_wrong_thing() {
        let spec = initial_spec("GitCanvas");

        let items = spec
            .iter()
            .flat_map(|section| &section.entries)
            .filter(|entry| matches!(entry, Entry::Item { .. }))
            .count();
        assert_eq!(items, 0);
        assert!(spec.iter().all(|section| section.title != "File"));
        // The system's own items keep the system's own text until a language is known.
        assert!(spec
            .iter()
            .flat_map(|section| &section.entries)
            .all(|entry| !matches!(entry, Entry::Standard(_, Some(_)))));
    }

    #[test]
    fn only_the_applications_own_items_map_to_actions() {
        assert_eq!(action_for(OPEN_FOLDER_ID), Some(MenuAction::OpenFolder));
        assert_eq!(action_for(CLOSE_TAB_ID), Some(MenuAction::CloseTab));
        assert_eq!(action_for("copy"), None);
        assert_eq!(action_for(""), None);
    }
}
