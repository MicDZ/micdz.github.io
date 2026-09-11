// 1. 页面与字体设置
#set document(
  title: "今天去哪吃？—— HUST 餐厅推荐清单",
  author: "MicDZ", // 支持字符串或数组（多人）
  keywords: ("美食"),
  // date: datetime(2023, 10, 25), // 设置文档创建时间，不填默认是当前时间
)

#set page(
  paper: "a4",
  margin: (x: 1.5cm, y: 2cm),
  footer: context [
    #let i = counter(page).get().first()
    #if i == 1 {
        align(right)[
          #text(size: 8pt, fill: gray)[#let update-date = datetime.today()
          最后更新于：#update-date.display("[year]年[month]月[day]日"), by 群珊]
        ]
    }
  ]
  
)

// 设置中文字体，按顺序回退，确保中文正常显示
// 你可以根据电脑上的字体修改这里，例如 "SimSun" (宋体) 或 "PingFang SC"
#set text(font: ( "Noto Sans SC", ), lang: "zh")

// 2. 自定义组件：餐厅卡片
#let restaurant(name, price, rating, dishes, comment) = {
  // 使用 block 确保每个餐厅的内容尽量不被分页打断
  block(width: 100%, breakable: false, inset: (bottom: 1em))[
    
    // --- 餐厅名称 ---
    #text(weight: "black", size: 13pt, fill: rgb("#2c3e50"))[#name]
    #v(0.3em) // 垂直间距

    // --- 基本信息行 (价格 + 评分) ---
    #grid(
      columns: (1fr, 1fr),
      gutter: 0.5em,
      [💰 #text(weight: "bold")[#price]], 
      [#text(fill: rgb("#f39c12"))[#rating]] // 评分用橙色高亮
    )
    #v(0.5em)

    // --- 推荐菜品 ---
    #box(
      fill: rgb("#f7f9f9"), 
      outset: 4pt, 
      radius: 4pt, 
      width: 100%
    )[
      #text(size: 9pt, weight: "bold", fill: gray)[🍽️ 推荐菜品：] \
      #text(size: 10pt)[#dishes]
    ]
    #v(0.5em)

    // --- 评语 ---
    #text(style: "italic", size: 10pt, fill: rgb("#555"))[
      “#comment”
    ]
    
    // --- 分隔线 ---
    #v(0.8em)
    #line(length: 100%, stroke: 0.5pt + silver)
  ]
}

// 3. 文档主标题
#align(center)[
  #text(size: 18pt, weight: "bold")[今天去哪吃？—— HUST餐厅推荐清单]
  #v(1em)
]

// 4. 开启双栏布局
#show: columns.with(2, gutter: 2em)

#restaurant(
  "大碗先生（中商鲁巷店）",
  "¥45/人",
  "★★★★★",
  "孜然牛肉, 小馒头, 擂辣椒皮蛋",
  "孜然牛肉非常适合夹在小馒头里吃！经理服务态度超级好，之前反馈小程序没法点米饭的问题，经理直接免单还送了优惠券，体验满分。"
)

#restaurant(
  "红旺餐厅（生活门烧烤街）",
  "¥35/人",
  "★★★★☆",
  "虎皮青椒, 酸辣土豆丝, 辣子鸡, 口水鸡",
  "性价比和味道都很不错的家常小炒。辣子鸡是鸡胸肉做的，口感独特但很好吃。除了干锅以外，其他的菜基本都值得尝试。"
)

#restaurant(
  "小菜园新徽菜（世界城广场五楼）",
  "¥75/人",
  "★★★★★",
  "芸豆丝, 地锅鸡, 红烧肉, 炒饭, 肉丸汤",
  "适合聚餐，来吃过很多次。最钟情芸豆丝，红烧肉是偏甜口的网红菜。避雷海鲜粉丝，其他大部分菜品味道都不错。"
)

#restaurant(
  "浪小贝潮汕砂锅粥（世界城广场五楼）",
  "¥65/人",
  "★★★☆☆",
  "鲜虾干贝粥, 小管鱿鱼, 鲮鱼油麦菜",
  "适合偶尔尝鲜。爱吃咸口粥的推荐鲜虾干贝粥，白贝粥腥味较重不推荐。注意干捞罗氏虾是芥末味的，吃不惯的慎点。"
)

#restaurant(
  "顺德古法干蒸菜（光谷鲁巷巷内）",
  "¥50/人",
  "★★★★",
  "干蒸排骨, 干蒸小肠",
  "口味偏清淡，性价比很高，目前人不多不用排队。青菜做法比较特别（不去皮）。适合偶尔想吃清淡口味的时候来。"
)

