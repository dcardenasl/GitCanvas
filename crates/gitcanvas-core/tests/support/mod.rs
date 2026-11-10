#![allow(dead_code)]

use git2::{Oid, Repository, Signature, Time};
use tempfile::TempDir;

pub struct Fixture {
    pub dir: TempDir,
    pub repo: Repository,
}

impl Fixture {
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        // Otherwise a checkout picks up whatever `core.autocrlf` the machine
        // running the test happens to have — true by default on Git for
        // Windows — and rewrites committed `\n` content to `\r\n` on disk,
        // which is exactly what a byte-exact assertion on checked-out content
        // is meant to catch.
        repo.config()
            .unwrap()
            .set_bool("core.autocrlf", false)
            .unwrap();
        Self { dir, repo }
    }

    pub fn commit(&self, reference: &str, message: &str, parents: &[Oid], time: i64) -> Oid {
        let signature =
            Signature::new("Test Author", "test@example.com", &Time::new(time, 0)).unwrap();
        let tree_id = self.repo.treebuilder(None).unwrap().write().unwrap();
        let tree = self.repo.find_tree(tree_id).unwrap();
        let parents: Vec<_> = parents
            .iter()
            .map(|id| self.repo.find_commit(*id).unwrap())
            .collect();
        let refs: Vec<_> = parents.iter().collect();
        self.repo
            .commit(
                Some(reference),
                &signature,
                &signature,
                message,
                &tree,
                &refs,
            )
            .unwrap()
    }

    /// Commits a tree built from `files`, so diffs have real content to read.
    ///
    /// Paths are flat on purpose: nesting adds nothing a diff test can assert
    /// that a flat tree cannot.
    pub fn commit_files(
        &self,
        reference: &str,
        message: &str,
        parents: &[Oid],
        time: i64,
        files: &[(&str, &[u8])],
    ) -> Oid {
        let signature =
            Signature::new("Test Author", "test@example.com", &Time::new(time, 0)).unwrap();
        let mut builder = self.repo.treebuilder(None).unwrap();
        for (path, contents) in files {
            let blob = self.repo.blob(contents).unwrap();
            builder.insert(path, blob, 0o100_644).unwrap();
        }
        let tree_id = builder.write().unwrap();
        let tree = self.repo.find_tree(tree_id).unwrap();
        let parents: Vec<_> = parents
            .iter()
            .map(|id| self.repo.find_commit(*id).unwrap())
            .collect();
        let refs: Vec<_> = parents.iter().collect();
        self.repo
            .commit(
                Some(reference),
                &signature,
                &signature,
                message,
                &tree,
                &refs,
            )
            .unwrap()
    }
}

#[allow(
    clippy::disallowed_methods,
    reason = "Git is the test oracle in disposable fixtures; production never spawns it"
)]
pub fn git_with_input(fixture: &Fixture, args: &[&str], input: Option<&[u8]>) -> String {
    use std::io::Write;
    use std::process::Stdio;
    let mut child = std::process::Command::new("git")
        .args(args)
        .current_dir(fixture.dir.path())
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("LC_ALL", "C")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(input) = input {
        child.stdin.take().unwrap().write_all(input).unwrap();
    }
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap()
}

pub fn git(fixture: &Fixture, args: &[&str]) -> String {
    git_with_input(fixture, args, None)
}
