//! Read a Delta table with delta-rs. STUB — harness-ready, not yet built out.
//!
//! The region markers and the seed one-liner are in place so the docs can
//! reference this file and `cargo build --examples` compiles it today. The body
//! is filled in (with `deltalake::open_table` + a time-travel read) when the Rust
//! examples are built out.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // docs-read-delta-table-start
    // let path = docs_factory_seed::seed_dataset("orders")?;
    // let table = deltalake::open_table(&path).await?;
    // println!("{} files", table.get_files_count());
    println!("delta-rs read_delta_table example: not implemented yet");
    // docs-read-delta-table-end
    let _ = docs_factory_seed::seed_dataset; // keep the seed crate linked
    Ok(())
}
