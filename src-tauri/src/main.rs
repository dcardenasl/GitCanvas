//! Native process entry point for the GitCanvas desktop application.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gitcanvas_lib::run();
}
