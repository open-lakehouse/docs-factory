import { BookOpen, History, Table2 } from "lucide-react";
import { DuckDBIcon, PythonIcon, SparkIcon } from "@/components/EngineIcons";
import Shell from "@/components/layout/Shell";
import {
  Community,
  Engines,
  Hero,
  type Kind,
  Kinds,
  type Path,
  Paths,
  resolve,
} from "@/pages/home";
import Logo from "./Logo";

const START_ROUTE = "/tutorials/your-first-delta-table";

const PATHS: Path[] = [
  {
    title: "Use Delta tables",
    blurb: "Create a table, then read, append to, and overwrite it from your engine.",
    Icon: Table2,
    links: [
      { route: START_ROUTE },
      { route: "/how-to/read-a-delta-table" },
      { route: "/how-to/append-and-overwrite-data" },
    ],
  },
  {
    title: "History and time travel",
    blurb: "Every write is a commit: inspect them, and read the table as it was.",
    Icon: History,
    links: [
      { route: "/tutorials/explore-table-history" },
      { route: "/how-to/query-a-table-as-of-version" },
    ],
  },
  {
    title: "How it works",
    blurb: "The transaction log, table features, and the kernel engines share.",
    Icon: BookOpen,
    links: [
      { route: "/explanation/what-is-delta-lake" },
      { route: "/reference/table-features" },
      { route: "/explanation/delta-kernel-architecture" },
    ],
  },
];

// Until the per-engine setup guides (H38, H52, H40) are written, each engine
// opens on the tutorial that uses it.
const ENGINES = [
  { route: START_ROUTE, label: "Spark SQL & PySpark", icons: [SparkIcon] },
  { route: "/tutorials/python-to-duckdb", label: "deltalake (Python)", icons: [PythonIcon] },
  { route: "/how-to/read-a-delta-table", label: "DuckDB", icons: [DuckDBIcon] },
];

const KINDS: Kind[] = [
  { route: START_ROUTE, label: "Tutorials", blurb: "Learn by building, step by step." },
  {
    route: "/how-to/read-a-delta-table",
    label: "How-to guides",
    blurb: "Recipes for one task each.",
  },
  {
    route: "/explanation/what-is-delta-lake",
    label: "Concepts",
    blurb: "How the format works and why.",
  },
  {
    route: "/reference/table-features",
    label: "Reference",
    blurb: "Table features and protocol details.",
  },
];

export default function HomePage() {
  const actions = resolve([
    { route: START_ROUTE, label: "Create your first table" },
    { route: "/explanation/what-is-delta-lake", label: "What is Delta Lake?" },
  ]);
  return (
    <Shell>
      <Hero
        Logo={Logo}
        lead="An open table format that brings ACID transactions, time travel, and schema enforcement to your data lake. Write a table once and read it from Spark, Python, DuckDB, and more."
        actions={actions}
      />
      <Paths paths={PATHS} />
      <Engines title="Pick your engine" engines={ENGINES} />
      <Kinds kinds={KINDS} />
      <Community />
    </Shell>
  );
}
