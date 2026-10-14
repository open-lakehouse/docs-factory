import { Blocks, Database, Server } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DuckDBIcon,
  PandasIcon,
  PolarsIcon,
  PythonIcon,
  SparkIcon,
} from "@/components/EngineIcons";
import Shell from "@/components/layout/Shell";
import {
  Community,
  Engines,
  environmentCommands,
  Hero,
  type Kind,
  Kinds,
  type Path,
  Paths,
  QuickStart,
  resolve,
} from "@/pages/home";
import Logo from "./Logo";

// The getting-started tutorial's own environment commands, so the two can't
// drift; a build that didn't publish that page drops the block.
const START_ROUTE = "/tutorials/getting-started";
const startEnv = environmentCommands(START_ROUTE);
const QUICKSTART = startEnv.length
  ? [...startEnv, "docker exec unitycatalog bin/uc catalog list"]
  : [];

const PATHS: Path[] = [
  {
    title: "Use Unity Catalog",
    blurb: "Create catalogs, tables, and volumes, and query them from your engine.",
    Icon: Database,
    links: [
      { route: "/tutorials/python-client" },
      { route: "/how-to/manage-catalogs-and-schemas" },
      { route: "/tutorials/managed-delta-table" },
    ],
  },
  {
    title: "Operate a server",
    blurb: "Persist metadata in PostgreSQL and connect the catalog to cloud storage.",
    Icon: Server,
    links: [
      { route: "/how-to/configure-backend-db" },
      { route: "/how-to/configure-aws-storage" },
      { route: "/how-to/managed-storage-s3" },
    ],
  },
  {
    title: "Build an integration",
    blurb: "Talk to the catalog from your own code through the clients and REST APIs.",
    Icon: Blocks,
    links: [
      { route: "/tutorials/python-client", label: "Python client" },
      { route: "/reference/api/catalog" },
      { route: "/reference/api/delta" },
    ],
  },
];

const ENGINES = [
  { route: "/how-to/configure-spark", label: "Apache Spark", icons: [SparkIcon] },
  { route: "/how-to/duckdb", label: "DuckDB", icons: [DuckDBIcon] },
  { route: "/how-to/python-dataframes", label: "Polars & pandas", icons: [PolarsIcon, PandasIcon] },
  { route: "/tutorials/python-client", label: "Python client", icons: [PythonIcon] },
];

const KINDS: Kind[] = [
  {
    route: "/tutorials/getting-started",
    label: "Tutorials",
    blurb: "Learn by building, step by step.",
  },
  {
    route: "/how-to/run-local-server",
    label: "How-to guides",
    blurb: "Recipes for one task each.",
  },
  { route: "/explanation/uc-basics", label: "Concepts", blurb: "How the catalog works and why." },
  {
    route: "/reference/features-and-limitations",
    label: "Reference",
    blurb: "Supported features and known issues.",
  },
  { route: "/reference/api", label: "REST API", blurb: "Every endpoint, with request samples." },
];

export default function HomePage() {
  const [start] = resolve([{ route: START_ROUTE }]);
  const actions = resolve([
    { route: START_ROUTE, label: "Create your first catalog" },
    { route: "/explanation/what-is-unity-catalog", label: "What is Unity Catalog?" },
  ]);
  return (
    <Shell>
      <Hero
        Logo={Logo}
        lead="The open catalog for your tables, volumes, functions, and models. Govern data once and query it from Spark, DuckDB, Python, and more."
        actions={actions}
      />
      <QuickStart
        title="Run it locally in a minute"
        intro={
          <>
            Needs only Docker. This starts a server on <code>localhost:8080</code> with two sample
            catalogs and lists them.
          </>
        }
        commands={QUICKSTART}
        next={
          start && (
            <>
              Next: <Link to={start.route}>{start.label}</Link> walks through these steps and builds
              a table of your own.
            </>
          )
        }
      />
      <Paths paths={PATHS} />
      <Engines title="Connect your engine" engines={ENGINES} />
      <Kinds kinds={KINDS} />
      <Community />
    </Shell>
  );
}
