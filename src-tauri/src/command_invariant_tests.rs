//! Static guards for the Tauri boundary and IPC dispatch surface.

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
};

use syn::{
    parse::Parser,
    punctuated::Punctuated,
    visit::{self, Visit},
    Expr, ExprCall, ExprMacro, Item, ItemFn, Path, Token, TypePath, UseTree,
};

const COMMAND_GATE_EXCEPTIONS: &[(&str, &str)] = &[];

fn command_sources() -> Vec<PathBuf> {
    let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/commands");
    let mut paths = fs::read_dir(directory)
        .expect("command source directory must be readable")
        .map(|entry| entry.expect("command source entry must be readable").path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "rs"))
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

fn command_functions() -> (BTreeMap<String, ItemFn>, BTreeMap<String, BTreeSet<String>>) {
    let mut commands = BTreeMap::new();
    let mut gates_by_command = BTreeMap::new();
    for path in command_sources() {
        let source = fs::read_to_string(&path).expect("command source must be readable");
        let file = syn::parse_file(&source).expect("command source must parse as Rust");
        let gates = source_runtime_gates(&file);
        for item in file.items {
            let Item::Fn(function) = item else {
                continue;
            };
            let is_command = function.attrs.iter().any(|attribute| {
                let segments = &attribute.path().segments;
                segments.len() == 2
                    && segments[0].ident == "tauri"
                    && segments[1].ident == "command"
            });
            if is_command {
                let name = function.sig.ident.to_string();
                assert!(commands.insert(name.clone(), function).is_none());
                gates_by_command.insert(name, gates.clone());
            }
        }
    }
    (commands, gates_by_command)
}

#[derive(Default)]
struct GateCalls {
    called: BTreeSet<String>,
}

impl<'ast> Visit<'ast> for GateCalls {
    fn visit_expr_call(&mut self, expression: &'ast ExprCall) {
        if let Expr::Path(path) = expression.func.as_ref() {
            if let Some(segment) = path.path.segments.last() {
                if segment.ident == "read" || segment.ident == "write" {
                    self.called.insert(segment.ident.to_string());
                }
            }
        }
        visit::visit_expr_call(self, expression);
    }
}

fn runtime_gate_imports(tree: &UseTree, prefix: &mut Vec<String>, gates: &mut BTreeSet<String>) {
    match tree {
        UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            runtime_gate_imports(&path.tree, prefix, gates);
            prefix.pop();
        }
        UseTree::Name(name) => {
            let gate = name.ident.to_string();
            if prefix.last().is_some_and(|segment| segment == "runtime")
                && (gate == "read" || gate == "write")
            {
                gates.insert(gate);
            }
        }
        UseTree::Group(group) => {
            for item in &group.items {
                runtime_gate_imports(item, prefix, gates);
            }
        }
        UseTree::Rename(rename) => {
            let original = rename.ident.to_string();
            if prefix.last().is_some_and(|segment| segment == "runtime")
                && (original == "read" || original == "write")
            {
                gates.insert(rename.rename.to_string());
            }
        }
        UseTree::Glob(_) => {}
    }
}

fn source_runtime_gates(file: &syn::File) -> BTreeSet<String> {
    let mut gates = BTreeSet::new();
    for item in &file.items {
        if let Item::Use(item) = item {
            runtime_gate_imports(&item.tree, &mut Vec::new(), &mut gates);
        }
    }
    gates
}

#[derive(Default)]
struct StateRepositoryType {
    in_state: bool,
    has_repository: bool,
}

impl<'ast> Visit<'ast> for StateRepositoryType {
    fn visit_type_path(&mut self, path: &'ast TypePath) {
        if path
            .path
            .segments
            .iter()
            .any(|segment| segment.ident == "State")
        {
            let previous = self.in_state;
            self.in_state = true;
            visit::visit_type_path(self, path);
            self.in_state = previous;
            return;
        }
        if self.in_state
            && path
                .path
                .segments
                .iter()
                .any(|segment| segment.ident == "Repository" || segment.ident == "ActiveRepo")
        {
            self.has_repository = true;
        }
        visit::visit_type_path(self, path);
    }
}

#[derive(Default)]
struct RegisteredCommandNames {
    names: Vec<String>,
}

impl<'ast> Visit<'ast> for RegisteredCommandNames {
    fn visit_expr_macro(&mut self, expression: &'ast ExprMacro) {
        if expression
            .mac
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "collect_commands")
        {
            let parser = Punctuated::<Path, Token![,]>::parse_terminated;
            let paths = parser
                .parse2(expression.mac.tokens.clone())
                .expect("registered command paths must parse");
            self.names.extend(paths.iter().filter_map(|path| {
                path.segments
                    .last()
                    .map(|segment| segment.ident.to_string())
            }));
        }
        visit::visit_expr_macro(self, expression);
    }
}

fn registered_command_names() -> Vec<String> {
    let source = include_str!("lib.rs");
    let file = syn::parse_file(source).expect("application entry point must parse as Rust");
    let mut visitor = RegisteredCommandNames::default();
    visitor.visit_file(&file);
    visitor.names
}

#[test]
fn every_tauri_command_runs_through_the_runtime_gate() {
    let (commands, gates_by_command) = command_functions();
    for (name, function) in commands {
        let mut gate = GateCalls::default();
        gate.visit_block(&function.block);
        let imports = gates_by_command
            .get(&name)
            .expect("command source gate imports exist");
        let exception = COMMAND_GATE_EXCEPTIONS
            .iter()
            .find(|(command, _reason)| *command == name);
        assert!(
            gate.called.iter().any(|call| imports.contains(call)) || exception.is_some(),
            "{name} must call runtime::read/write or have a named exception"
        );
        if let Some((_, reason)) = exception {
            assert!(!reason.trim().is_empty(), "{name} exception needs a reason");
        }
    }
}

#[test]
fn tauri_state_never_holds_a_repository_handle() {
    for (name, function) in command_functions().0 {
        let mut visitor = StateRepositoryType::default();
        visitor.visit_signature(&function.sig);
        assert!(
            !visitor.has_repository,
            "{name} must not receive Repository or ActiveRepo through tauri::State"
        );
    }
}

#[test]
fn ipc_registry_matches_every_command_and_safe_handlers_dispatch() {
    let commands = command_functions().0;
    let registered = registered_command_names();
    assert_eq!(registered.len(), commands.len());
    assert_eq!(
        registered.iter().collect::<BTreeSet<_>>().len(),
        registered.len(),
        "the command registry must not contain duplicates"
    );
    for name in &registered {
        assert!(
            commands.contains_key(name),
            "registered unknown command {name}"
        );
    }

    let webview = super::repository_tests::test_webview();
    let unknown = super::repository_tests::invoke(
        &webview,
        "gitcanvas_dispatch_probe_not_registered",
        serde_json::json!({}),
    )
    .expect_err("an unregistered command must fail");

    // Never execute credential deletion, keychain access, or a live GitHub
    // request in a test. Their registry entries are checked against every
    // command attribute above; all other handlers pass through real IPC.
    let unsafe_zero_argument = [
        "forget_github_token",
        "has_github_token",
        "list_github_repositories",
    ];
    let mut dispatched = 0;
    for name in registered {
        let function = commands.get(&name).expect("registered command exists");
        if unsafe_zero_argument.contains(&name.as_str()) {
            assert!(
                function.sig.inputs.is_empty(),
                "review IPC probe when {name} gains parameters"
            );
            continue;
        }
        let result = super::repository_tests::invoke(&webview, &name, serde_json::json!({}));
        if let Err(error) = result {
            assert_ne!(error, unknown, "{name} was not dispatched by Tauri");
        }
        dispatched += 1;
    }
    assert_eq!(dispatched, commands.len() - unsafe_zero_argument.len());
}
