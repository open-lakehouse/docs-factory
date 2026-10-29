"""Run the tutorial's agent with a real chat model instead of the stand-in.

Needs an OpenAI API key, so it doesn't run unattended: it has no script block,
so the test lanes don't collect it. real_model_local_check.py runs it against a
fake OpenAI-compatible server. The tools are the same catalog functions and
async adapter as in agent_tool.py.

With Unity Catalog started and OPENAI_API_KEY set, run from this folder:

    EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 \
      --with unitycatalog-langchain==0.4.0 --with langgraph-prebuilt==1.0.8 \
      --with langchain-openai==1.7.2 python real_model.py
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

        # gpt-4o-mini is a provider model OpenAI can retire; check it's still
        # served on a release bump. real_model_local_check.py asserts this name
        # is what ChatOpenAI sends.
        # --8<-- [start:real-model]
        from langchain_openai import ChatOpenAI

        model = ChatOpenAI(model="gpt-4o-mini")
        # --8<-- [end:real-model]

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
