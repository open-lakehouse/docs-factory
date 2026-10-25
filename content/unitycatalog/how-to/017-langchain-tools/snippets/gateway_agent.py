"""Run the agent with a chat model routed through the MLflow AI Gateway.

The gateway (start_gateway.sh, configured by gateway.yaml) holds the provider
key; this process only knows the gateway's URL and endpoint name. The tools are
the same catalog functions and async adapter as in tools.py.

Needs a provider behind the gateway, so it doesn't run unattended. Run it with
Unity Catalog and the gateway started:

    EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 \
      --with unitycatalog-langchain==0.4.0 \
      --with langgraph-prebuilt==1.0.8 --with langchain-community==0.4.1 \
      --with mlflow==3.17.0 python gateway_agent.py

`ChatMlflow` needs `mlflow` in this process too: it builds MLflow's
deployments client for the gateway URL.
"""

import asyncio
import os

from unitycatalog.client.exceptions import NotFoundException

QUESTION = "Price 3 units at 19.99 with 10% off, shipped express at 2 kg."


async def main() -> list:
    from langchain.agents import create_agent
    from pricing import order_total, shipping_cost
    from unitycatalog.ai.core.client import (
        UnitycatalogClient,
        UnitycatalogFunctionClient,
    )
    from unitycatalog.ai.langchain.toolkit import UCFunctionToolkit
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)
    try:
        try:
            await CatalogsApi(api).delete_catalog(name="tools", force=True)
        except NotFoundException:
            pass
        uc = UnitycatalogClient(api_client=api)
        await uc.create_catalog_async(name="tools")
        await uc.create_schema_async(name="pricing", catalog_name="tools")
        for func in (order_total, shipping_cost):
            await client.create_python_function_async(
                func=func, catalog="tools", schema="pricing"
            )
        tools = UCFunctionToolkit(
            function_names=["tools.pricing.order_total", "tools.pricing.shipping_cost"],
            client=client,
        ).tools

        def run_on_this_loop(tool):
            async def run(**arguments):
                result = await client.execute_function_async(
                    tool.uc_function_name, parameters=arguments
                )
                return result.to_json()

            tool.coroutine = run
            return tool

        agent_tools = [run_on_this_loop(tool) for tool in tools]

        # --8<-- [start:gateway-model]
        from langchain_community.chat_models import ChatMlflow

        model = ChatMlflow(target_uri="http://localhost:5050", endpoint="chat")
        # --8<-- [end:gateway-model]

        agent = create_agent(model, tools=agent_tools)
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": QUESTION}]}
        )
        for message in result["messages"]:
            print(message.type, message.content)
        await CatalogsApi(api).delete_catalog(name="tools", force=True)
        return result["messages"]
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
