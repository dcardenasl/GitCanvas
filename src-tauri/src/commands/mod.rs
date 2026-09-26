//! The IPC surface.
//!
//! One module per domain. Every command here is a thin translation between
//! Tauri and `gitcanvas_core`: no git logic lives in this layer.
//!
//! `runtime` is where blocking work is scheduled: reads and writes go through it
//! and nowhere else.
//!
//! Modules stay public and commands are referenced by their full path in
//! `collect_commands!`. The command macros generate hidden companion items
//! next to each function, and a narrow `pub use` of the function alone would
//! leave those behind.

pub mod actions;

pub mod diff;

pub mod github;

pub mod repository;

pub mod runtime;

pub mod watch;
