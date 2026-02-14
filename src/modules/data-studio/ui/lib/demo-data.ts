import type { CodeCell } from "../../runtime";
import { generateId } from "./utils";

export const SAMPLE_CSV_DATA = `product,category,revenue,units_sold,region
"Widget A",Electronics,15000,120,North
"Widget B",Electronics,22000,180,South
"Gadget X",Home,8500,95,North
"Gadget Y",Home,12000,140,East
"Device M",Electronics,31000,250,West
"Device N",Electronics,28000,220,North
"Tool P",Industrial,45000,80,South
"Tool Q",Industrial,38000,65,East
"Accessory R",Home,6500,310,West
"Accessory S",Home,7200,280,North
"Component T",Industrial,52000,45,South
"Component U",Industrial,48000,52,West`;

export function createDemoCells(): CodeCell[] {
  return [
    {
      id: generateId(),
      cell_type: "code",
      source: [
        "SELECT\n",
        "  category,\n",
        "  SUM(revenue) as total_revenue,\n",
        "  SUM(units_sold) as total_units\n",
        "FROM 'sample_sales.csv'\n",
        "GROUP BY category\n",
        "ORDER BY total_revenue DESC",
      ],
      outputs: [
        {
          output_type: "execute_result",
          data: {
            "application/json": [
              { category: "Industrial", total_revenue: 183000, total_units: 242 },
              { category: "Electronics", total_revenue: 96000, total_units: 770 },
              { category: "Home", total_revenue: 34200, total_units: 825 },
            ],
            "text/plain": ["Table with 3 columns, 3 rows"],
          },
          metadata: {},
          execution_count: 1,
        },
      ],
      execution_count: 1,
      metadata: { dataspren_type: "sql", viewName: "by_category" },
    },
    {
      id: generateId(),
      cell_type: "code",
      source: [
        "import re\n",
        "\n",
        "@sql_func\n",
        "def slug(text: str) -> str:\n",
        "    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')",
      ],
      outputs: [],
      execution_count: 3,
      metadata: { dataspren_type: "python" },
    },
    {
      id: generateId(),
      cell_type: "code",
      source: [
        "SELECT\n",
        "  product,\n",
        "  slug(product) as url_slug\n",
        "FROM 'sample_sales.csv'\n",
        "LIMIT 5",
      ],
      outputs: [
        {
          output_type: "execute_result",
          data: {
            "application/json": [
              { product: "Widget A", url_slug: "widget-a" },
              { product: "Widget B", url_slug: "widget-b" },
              { product: "Gadget X", url_slug: "gadget-x" },
              { product: "Gadget Y", url_slug: "gadget-y" },
              { product: "Device M", url_slug: "device-m" },
            ],
            "text/plain": ["Table with 2 columns, 5 rows"],
          },
          metadata: {},
          execution_count: 4,
        },
      ],
      execution_count: 4,
      metadata: { dataspren_type: "sql", viewName: "with_slugs" },
    },
    {
      id: generateId(),
      cell_type: "code",
      source: [
        "by_category['share'] = (by_category['total_revenue'] / by_category['total_revenue'].sum() * 100).round(1)\n",
        "print(by_category)",
      ],
      outputs: [
        {
          output_type: "stream",
          name: "stdout",
          text: [
            "      category  total_revenue  total_units  share\n",
            "0   Industrial       183000.0        242.0   58.4\n",
            "1  Electronics        96000.0        770.0   30.7\n",
            "2         Home        34200.0        825.0   10.9",
          ],
        },
      ],
      execution_count: 5,
      metadata: { dataspren_type: "python" },
    },
  ];
}
