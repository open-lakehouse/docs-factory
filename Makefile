.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# Variables — override on the command line:
#   make run EXAMPLE=delta-lake-quickstart ENGINE=spark
# ---------------------------------------------------------------------------
EXAMPLE ?=
ENGINE  ?=

.PHONY: help install lint test run

help:  ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install:  ## Install all dependencies into the uv-managed venv
	uv sync --group dev

lint:  ## Run ty type-checker over the examples package
	uv run ty check examples/

test:  ## Run pytest over the examples package
	uv run pytest examples/ -v

run:  ## Run a single example: make run EXAMPLE=<journey-slug> ENGINE=<engine>
ifndef EXAMPLE
	$(error EXAMPLE is not set. Usage: make run EXAMPLE=<journey-slug> ENGINE=<engine>)
endif
ifndef ENGINE
	$(error ENGINE is not set. Usage: make run EXAMPLE=<journey-slug> ENGINE=<engine>)
endif
	uv run python -c \
		"from examples.$(subst -,_,$(EXAMPLE)) import $(ENGINE); $(ENGINE).run()"
