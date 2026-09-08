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
}
