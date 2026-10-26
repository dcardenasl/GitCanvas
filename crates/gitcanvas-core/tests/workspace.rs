#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
//! The workspace file, exercised on real files in a temp directory.

use std::{fs, path::Path, sync::Arc, thread};

use gitcanvas_core::{
    error::AppError,
    workspace::{
        store::{RecoveryKind, WorkspaceStore, FILE_NAME, MAX_FILE_BYTES},
        SavedSelection, TabRecord, Workspace, WorkspaceLimits, MAX_COLLAPSED_FOLDERS,
        MAX_FAVORITES, MAX_PATH_BYTES, MAX_RECENTS, MAX_TABS,
    },
    worktree::WorktreeSide,
};

const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";

/// An absolute path that is valid on every platform the tests run on.
fn project(name: &str) -> String {
    std::env::temp_dir()
        .join("gitcanvas-projects")
        .join(name)
        .to_str()
        .unwrap()
        .to_owned()
}

fn tab(name: &str) -> TabRecord {
    TabRecord {
        path: project(name),
        selection: SavedSelection::History,
        history_anchor: None,
        collapsed_folders: Vec::new(),
    }
}

fn workspace(names: &[&str]) -> Workspace {
    Workspace {
        tabs: names.iter().map(|name| tab(name)).collect(),
        active: names.first().map(|name| project(name)),
        favorites: Vec::new(),
        recents: Vec::new(),
        graph_preferences: Vec::new(),
        reference_filters: Vec::new(),
        reference_tree_preferences: Vec::new(),
    }
}

fn store(directory: &Path) -> WorkspaceStore {
    WorkspaceStore::new(directory)
}

fn write_raw(directory: &Path, contents: &str) {
    fs::write(directory.join(FILE_NAME), contents).unwrap();
}

fn backups(directory: &Path) -> Vec<std::path::PathBuf> {
    fs::read_dir(directory)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("workspace.json.corrupt-")
        })
        .collect()
}

#[test]
fn a_missing_file_loads_as_an_empty_workspace_without_recovery() {
    let directory = tempfile::tempdir().unwrap();

    let loaded = store(directory.path()).load().unwrap();

    assert_eq!(loaded.workspace, Workspace::default());
    assert!(loaded.recovery.is_none());
}

#[test]
fn the_limits_reported_are_the_ones_enforced() {
    let limits = WorkspaceLimits::current();

    assert_eq!(limits.max_tabs as usize, MAX_TABS);
    assert_eq!(limits.max_favorites as usize, MAX_FAVORITES);
    assert_eq!(limits.max_recents as usize, MAX_RECENTS);
}

#[test]
fn a_saved_workspace_loads_back_unchanged() {
    let directory = tempfile::tempdir().unwrap();
    let mut saved = workspace(&["alpha", "beta", "gamma"]);
    saved.active = Some(project("beta"));
    saved.tabs[0].selection = SavedSelection::Commit {
        commit_id: COMMIT.to_owned(),
        file_path: Some("src/main.rs".to_owned()),
        snapshot: true,
    };
    saved.tabs[0].history_anchor = Some(COMMIT.to_owned());
    saved.tabs[0].collapsed_folders = vec!["src".to_owned(), "docs/adr".to_owned()];
    saved.tabs[1].selection = SavedSelection::Worktree {
        side: WorktreeSide::Staged,
        file_path: None,
    };
    saved.favorites = vec![project("alpha"), project("delta")];
    saved.recents = vec![project("gamma"), project("alpha")];
    let store = store(directory.path());

    assert!(store.save(1, &saved).unwrap());
    let loaded = store.load().unwrap();

    assert_eq!(loaded.workspace, saved);
    assert!(loaded.recovery.is_none());
}

#[test]
fn saving_creates_the_data_directory_when_it_is_missing() {
    let root = tempfile::tempdir().unwrap();
    let nested = root.path().join("not").join("yet");

    assert!(store(&nested).save(1, &workspace(&["alpha"])).unwrap());

    assert!(nested.join(FILE_NAME).is_file());
}

#[test]
fn saving_leaves_no_temporary_file_behind() {
    let directory = tempfile::tempdir().unwrap();
    let store = store(directory.path());

    store.save(1, &workspace(&["alpha"])).unwrap();
    store.save(2, &workspace(&["beta"])).unwrap();

    let names: Vec<String> = fs::read_dir(directory.path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, vec![FILE_NAME.to_owned()]);
}

#[test]
fn a_save_older_than_the_last_applied_is_skipped() {
    let directory = tempfile::tempdir().unwrap();
    let store = store(directory.path());
    assert!(store.save(5, &workspace(&["newer"])).unwrap());

    assert!(!store.save(4, &workspace(&["older"])).unwrap());
    assert!(!store.save(5, &workspace(&["repeat"])).unwrap());

    assert_eq!(store.load().unwrap().workspace, workspace(&["newer"]));
    assert!(store.save(6, &workspace(&["latest"])).unwrap());
    assert_eq!(store.load().unwrap().workspace, workspace(&["latest"]));
}

#[test]
fn concurrent_saves_end_with_the_newest_revision() {
    let directory = tempfile::tempdir().unwrap();
    let store = Arc::new(store(directory.path()));
    let names: Vec<String> = (1..=12).map(|index| format!("project{index}")).collect();

    let handles: Vec<_> = names
        .iter()
        .enumerate()
        .map(|(index, name)| {
            let store = Arc::clone(&store);
            let saved = workspace(&[name]);
            let revision = u32::try_from(index).unwrap() + 1;
            thread::spawn(move || store.save(revision, &saved).unwrap())
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }

    let loaded = store.load().unwrap();
    assert_eq!(loaded.workspace, workspace(&["project12"]));
    assert!(loaded.recovery.is_none());
}

#[test]
fn a_rejected_save_leaves_the_stored_workspace_untouched() {
    let directory = tempfile::tempdir().unwrap();
    let store = store(directory.path());
    store.save(1, &workspace(&["kept"])).unwrap();

    let mut duplicate_tab = workspace(&["a"]);
    duplicate_tab.tabs.push(tab("a"));
    let mut active_elsewhere = workspace(&["a"]);
    active_elsewhere.active = Some(project("elsewhere"));
    let mut relative = workspace(&["a"]);
    relative.tabs[0].path = "relative/path".to_owned();
    relative.active = Some("relative/path".to_owned());
    let mut empty_path = workspace(&["a"]);
    empty_path.favorites = vec![String::new()];
    let mut nul = workspace(&["a"]);
    nul.recents = vec![format!("{}\0", project("a"))];
    let mut overlong = workspace(&["a"]);
    overlong.favorites = vec![format!("{}/{}", project("a"), "x".repeat(MAX_PATH_BYTES))];
    let mut repeated_favorite = workspace(&["a"]);
    repeated_favorite.favorites = vec![project("a"), project("a")];
    let mut bad_commit = workspace(&["a"]);
    bad_commit.tabs[0].selection = SavedSelection::Commit {
        commit_id: "abc123".to_owned(),
        file_path: None,
        snapshot: false,
    };
    let mut bad_anchor = workspace(&["a"]);
    bad_anchor.tabs[0].history_anchor = Some("z".repeat(40));
    let mut empty_file = workspace(&["a"]);
    empty_file.tabs[0].selection = SavedSelection::Worktree {
        side: WorktreeSide::Unstaged,
        file_path: Some(String::new()),
    };
    let mut too_many_folders = workspace(&["a"]);
    too_many_folders.tabs[0].collapsed_folders = vec!["d".to_owned(); MAX_COLLAPSED_FOLDERS + 1];
    let mut too_many_tabs = workspace(&[]);
    too_many_tabs.tabs = (0..=MAX_TABS).map(|n| tab(&format!("p{n}"))).collect();
    let mut too_many_recents = workspace(&["a"]);
    too_many_recents.recents = (0..=MAX_RECENTS)
        .map(|n| project(&format!("r{n}")))
        .collect();
    let mut too_many_favorites = workspace(&["a"]);
    too_many_favorites.favorites = (0..=MAX_FAVORITES)
        .map(|n| project(&format!("f{n}")))
        .collect();

    let cases = [
        ("duplicate tab", duplicate_tab),
        ("active elsewhere", active_elsewhere),
        ("relative path", relative),
        ("empty path", empty_path),
        ("NUL in path", nul),
        ("overlong path", overlong),
        ("repeated favorite", repeated_favorite),
        ("short commit id", bad_commit),
        ("non-hex anchor", bad_anchor),
        ("empty file path", empty_file),
        ("too many folders", too_many_folders),
        ("too many tabs", too_many_tabs),
        ("too many recents", too_many_recents),
        ("too many favorites", too_many_favorites),
    ];
    for (name, invalid) in cases {
        let result = store.save(99, &invalid);
        assert!(
            matches!(result, Err(AppError::InvalidInput(_))),
            "{name} must be refused, got {result:?}"
        );
    }

    assert_eq!(store.load().unwrap().workspace, workspace(&["kept"]));
}

#[test]
fn a_rejected_save_does_not_consume_its_revision() {
    let directory = tempfile::tempdir().unwrap();
    let store = store(directory.path());
    let mut invalid = workspace(&["a"]);
    invalid.active = Some(project("elsewhere"));

    assert!(store.save(3, &invalid).is_err());

    assert!(store.save(3, &workspace(&["a"])).unwrap());
}

#[test]
fn a_workspace_too_large_for_the_file_is_refused_without_writing() {
    let directory = tempfile::tempdir().unwrap();
    let store = store(directory.path());
    store.save(1, &workspace(&["kept"])).unwrap();
    let long_folder = "d".repeat(MAX_PATH_BYTES);
    let mut huge = workspace(&["a", "b", "c"]);
    for tab in &mut huge.tabs {
        tab.collapsed_folders = vec![long_folder.clone(); MAX_COLLAPSED_FOLDERS];
    }

    let result = store.save(2, &huge);

    assert!(
        matches!(result, Err(AppError::InvalidInput(_))),
        "{result:?}"
    );
    assert_eq!(store.load().unwrap().workspace, workspace(&["kept"]));
}

#[test]
fn unreadable_json_is_set_aside_not_deleted() {
    let directory = tempfile::tempdir().unwrap();
    write_raw(directory.path(), "{ this is not json");
    let store = store(directory.path());

    let loaded = store.load().unwrap();

    assert_eq!(loaded.workspace, Workspace::default());
    let recovery = loaded.recovery.expect("a recovery is reported");
    assert_eq!(recovery.kind, RecoveryKind::Corrupt);
    assert!(!recovery.detail.is_empty());
    assert!(!directory.path().join(FILE_NAME).exists());
    assert_eq!(
        fs::read_to_string(&recovery.backup).unwrap(),
        "{ this is not json"
    );
    // The application keeps working: a new save and load succeed.
    store.save(1, &workspace(&["fresh"])).unwrap();
    assert_eq!(store.load().unwrap().workspace, workspace(&["fresh"]));
}

#[test]
fn a_newer_schema_version_is_set_aside_and_reported_as_such() {
    let directory = tempfile::tempdir().unwrap();
    write_raw(
        directory.path(),
        r#"{"version": 6, "workspace": {"anything": true}}"#,
    );

    let recovery = store(directory.path())
        .load()
        .unwrap()
        .recovery
        .expect("a recovery is reported");

    assert_eq!(recovery.kind, RecoveryKind::UnsupportedVersion);
    assert!(fs::read_to_string(&recovery.backup)
        .unwrap()
        .contains("anything"));
}

#[test]
fn a_missing_version_is_not_assumed_to_be_current() {
    let directory = tempfile::tempdir().unwrap();
    write_raw(directory.path(), r#"{"workspace": {}}"#);

    let recovery = store(directory.path()).load().unwrap().recovery.unwrap();

    assert_eq!(recovery.kind, RecoveryKind::UnsupportedVersion);
}

#[test]
fn unknown_and_missing_fields_are_corrupt_not_silently_dropped() {
    for contents in [
        r#"{"version": 1, "workspace": {"tabs": [], "active": null, "favorites": [], "recents": [], "extra": 1}}"#,
        r#"{"version": 1, "workspace": {"tabs": [], "active": null, "favorites": []}}"#,
        r#"{"version": 1, "workspace": {"tabs": [{"path": "/x"}], "active": null, "favorites": [], "recents": []}}"#,
        r#"{"version": 1, "workspace": null}"#,
        r"[]",
    ] {
        let directory = tempfile::tempdir().unwrap();
        write_raw(directory.path(), contents);

        let loaded = store(directory.path()).load().unwrap();

        let recovery = loaded
            .recovery
            .unwrap_or_else(|| panic!("{contents} was accepted"));
        assert_eq!(recovery.kind, RecoveryKind::Corrupt, "{contents}");
        assert_eq!(loaded.workspace, Workspace::default());
    }
}

#[test]
fn well_formed_data_that_breaks_a_workspace_rule_is_corrupt() {
    let directory = tempfile::tempdir().unwrap();
    let mut duplicate = workspace(&["a"]);
    duplicate.tabs.push(tab("a"));
    // Written by hand, bypassing `save`, the way an edit or another tool would.
    let json = serde_json::json!({ "version": 5, "workspace": duplicate });
    write_raw(directory.path(), &json.to_string());

    let recovery = store(directory.path()).load().unwrap().recovery.unwrap();

    assert_eq!(recovery.kind, RecoveryKind::Corrupt);
    assert!(recovery.detail.contains("two tabs"), "{}", recovery.detail);
}

#[test]
fn a_file_over_the_size_bound_is_set_aside_without_being_parsed() {
    let directory = tempfile::tempdir().unwrap();
    let size = usize::try_from(MAX_FILE_BYTES).unwrap() + 1;
    write_raw(directory.path(), &" ".repeat(size));

    let recovery = store(directory.path()).load().unwrap().recovery.unwrap();

    assert_eq!(recovery.kind, RecoveryKind::TooLarge);
    assert!(Path::new(&recovery.backup).is_file());
}

#[test]
fn only_the_newest_backups_are_kept() {
    let directory = tempfile::tempdir().unwrap();
    let store = store(directory.path());

    let now = std::time::SystemTime::now();
    for index in 0..6_u64 {
        write_raw(directory.path(), &format!("damaged {index}"));
        let backup = store.load().unwrap().recovery.unwrap().backup;
        // Backups are ordered by modification time, which a fast loop would
        // leave identical; set it so that a later backup is a newer one.
        let age = std::time::Duration::from_secs((6 - index) * 100);
        let when = filetime::FileTime::from_system_time(now.checked_sub(age).unwrap());
        filetime::set_file_mtime(&backup, when).unwrap();
    }

    // Names can repeat once an older backup is pruned, so what survived is
    // identified by what it holds.
    let mut kept: Vec<String> = backups(directory.path())
        .iter()
        .map(|path| fs::read_to_string(path).unwrap())
        .collect();
    kept.sort();
    assert_eq!(kept, vec!["damaged 3", "damaged 4", "damaged 5"]);
}

#[test]
fn the_residue_of_an_interrupted_save_does_not_disturb_the_stored_workspace() {
    let directory = tempfile::tempdir().unwrap();
    let store = store(directory.path());
    store.save(1, &workspace(&["safe"])).unwrap();
    // What a crash between writing the new file and renaming it leaves behind.
    let leftover = directory.path().join("workspace.json.tmp-interrupted");
    fs::write(&leftover, "half a workspace").unwrap();

    let loaded = store.load().unwrap();

    assert_eq!(loaded.workspace, workspace(&["safe"]));
    assert!(loaded.recovery.is_none());
    assert!(!leftover.exists(), "the leftover is removed on load");
}

#[test]
fn unrelated_files_in_the_data_directory_are_never_touched() {
    let directory = tempfile::tempdir().unwrap();
    let log = directory.path().join("logs");
    fs::create_dir_all(&log).unwrap();
    fs::write(log.join("app.log"), "log").unwrap();
    fs::write(directory.path().join("other.tmp"), "keep").unwrap();
    let store = store(directory.path());

    store.save(1, &workspace(&["a"])).unwrap();
    store.load().unwrap();

    assert!(log.join("app.log").is_file());
    assert!(directory.path().join("other.tmp").is_file());
}

#[test]
fn a_file_that_cannot_be_read_is_an_error_and_loses_nothing() {
    let directory = tempfile::tempdir().unwrap();
    // A directory where the file should be: opening and reading it fails.
    fs::create_dir(directory.path().join(FILE_NAME)).unwrap();

    let result = store(directory.path()).load();

    assert!(matches!(result, Err(AppError::Io(_))), "{result:?}");
    assert!(directory.path().join(FILE_NAME).is_dir());
    assert!(backups(directory.path()).is_empty());
}

#[test]
fn version_one_migrates_without_losing_workspace_data() {
    let dir = tempfile::tempdir().unwrap();
    let mut old = serde_json::to_value(workspace(&["migration"])).unwrap();
    old.as_object_mut().unwrap().remove("graph_preferences");
    write_raw(
        dir.path(),
        &serde_json::json!({"version": 1, "workspace": old}).to_string(),
    );
    let loaded = store(dir.path()).load().unwrap();
    assert_eq!(loaded.workspace, workspace(&["migration"]));
    assert!(loaded.recovery.is_none());
    store(dir.path()).save(1, &loaded.workspace).unwrap();
    let written: serde_json::Value =
        serde_json::from_slice(&fs::read(dir.path().join(FILE_NAME)).unwrap()).unwrap();
    assert_eq!(written["version"], 5);
}

#[test]
fn version_two_migrates_graph_preferences_to_worktree_scope() {
    use gitcanvas_core::workspace::{
        GraphColor, GraphPreferenceScope, GraphPreferences, ReferenceColor,
    };
    let directory = tempfile::tempdir().unwrap();
    let mut old_workspace = workspace(&["legacy"]);
    old_workspace.graph_preferences.push(GraphPreferences {
        path: project("legacy"),
        scope: GraphPreferenceScope::Worktree,
        principal: Some("refs/heads/main".into()),
        revision: 1,
        colors: vec![ReferenceColor {
            reference: "refs/heads/main".into(),
            color: GraphColor::Blue,
            edited: 1,
        }],
    });
    let mut value = serde_json::to_value(old_workspace.clone()).unwrap();
    value.as_object_mut().unwrap().remove("reference_filters");
    value["graph_preferences"][0]
        .as_object_mut()
        .unwrap()
        .remove("scope");
    write_raw(
        directory.path(),
        &serde_json::json!({ "version": 2, "workspace": value }).to_string(),
    );

    let loaded = store(directory.path()).load().unwrap();
    assert!(loaded.recovery.is_none());
    assert_eq!(
        loaded.workspace.graph_preferences[0].scope,
        GraphPreferenceScope::Worktree
    );
    assert_eq!(loaded.workspace.reference_filters, Vec::new());
    store(directory.path()).save(1, &loaded.workspace).unwrap();
    let written: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.path().join(FILE_NAME)).unwrap()).unwrap();
    assert_eq!(written["version"], 5);
    assert_eq!(
        written["workspace"]["graph_preferences"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn version_three_migrates_without_reference_tree_preferences() {
    let directory = tempfile::tempdir().unwrap();
    let mut old = serde_json::to_value(workspace(&["migration"])).unwrap();
    old.as_object_mut()
        .unwrap()
        .remove("reference_tree_preferences");
    write_raw(
        directory.path(),
        &serde_json::json!({ "version": 3, "workspace": old }).to_string(),
    );

    let loaded = store(directory.path()).load().unwrap();
    assert!(loaded.recovery.is_none());
    assert_eq!(loaded.workspace, workspace(&["migration"]));
    store(directory.path()).save(1, &loaded.workspace).unwrap();
    let written: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.path().join(FILE_NAME)).unwrap()).unwrap();
    assert_eq!(written["version"], 5);
}

#[test]
fn version_four_migrates_reference_search_preferences() {
    use gitcanvas_core::workspace::ReferenceFilterPreferences;

    let directory = tempfile::tempdir().unwrap();
    let mut old_workspace = workspace(&["migration"]);
    old_workspace
        .reference_filters
        .push(ReferenceFilterPreferences {
            path: project("closed"),
            excluded: vec!["refs/heads/side".into()],
            search: String::new(),
        });
    let mut value = serde_json::to_value(old_workspace).unwrap();
    value["reference_filters"][0]
        .as_object_mut()
        .unwrap()
        .remove("search");
    write_raw(
        directory.path(),
        &serde_json::json!({ "version": 4, "workspace": value }).to_string(),
    );

    let loaded = store(directory.path()).load().unwrap();
    assert!(loaded.recovery.is_none());
    assert_eq!(loaded.workspace.reference_filters[0].search, "");
    store(directory.path()).save(1, &loaded.workspace).unwrap();
    let written: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.path().join(FILE_NAME)).unwrap()).unwrap();
    assert_eq!(written["version"], 5);
    assert_eq!(written["workspace"]["reference_filters"][0]["search"], "");
}

#[test]
fn graph_preferences_validate_identity_and_edit_sequence() {
    use gitcanvas_core::workspace::{
        GraphColor, GraphPreferenceScope, GraphPreferences, ReferenceColor,
    };
    let mut data = Workspace::default();
    data.graph_preferences.push(GraphPreferences {
        path: project("closed"),
        scope: GraphPreferenceScope::Worktree,
        principal: Some("refs/heads/main".into()),
        revision: 1,
        colors: vec![ReferenceColor {
            reference: "refs/heads/main".into(),
            color: GraphColor::Violet,
            edited: 1,
        }],
    });
    let dir = tempfile::tempdir().unwrap();
    store(dir.path()).save(1, &data).unwrap();
    assert_eq!(store(dir.path()).load().unwrap().workspace, data);
    data.graph_preferences[0].colors[0].edited = 2;
    assert!(data.validate().is_err());
    data.graph_preferences[0].colors[0].edited = 1;
    data.graph_preferences[0].colors[0].reference = "../../escape".into();
    assert!(data.validate().is_err());
}

#[test]
fn reference_tree_preferences_are_bounded_unique_and_worktree_scoped() {
    use gitcanvas_core::workspace::ReferenceTreePreferences;

    let mut data = Workspace::default();
    data.reference_tree_preferences
        .push(ReferenceTreePreferences {
            path: project("closed"),
            collapsed: vec!["group:remote".into(), "folder:remote:origin/feature".into()],
        });
    let directory = tempfile::tempdir().unwrap();
    store(directory.path()).save(1, &data).unwrap();
    assert_eq!(store(directory.path()).load().unwrap().workspace, data);

    data.reference_tree_preferences[0].collapsed[1] = "".into();
    assert!(data.validate().is_err());
    data.reference_tree_preferences[0].collapsed = vec!["group:remote".into(); 2];
    assert!(data.validate().is_err());
}

#[test]
fn reference_filter_searches_are_bounded_and_round_trip() {
    use gitcanvas_core::workspace::{ReferenceFilterPreferences, MAX_REFERENCE_SEARCH_BYTES};

    let mut data = Workspace::default();
    data.reference_filters.push(ReferenceFilterPreferences {
        path: project("search"),
        excluded: vec!["refs/heads/side".into()],
        search: "feature/login".into(),
    });
    data.validate().unwrap();
    let serialized = serde_json::to_value(&data).unwrap();
    assert_eq!(
        serde_json::from_value::<Workspace>(serialized).unwrap(),
        data
    );

    data.reference_filters[0].search = "x".repeat(MAX_REFERENCE_SEARCH_BYTES + 1);
    assert!(data.validate().is_err());
}
