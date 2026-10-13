// Machines we demo. The vote page shows the photo, link and notes for the
// machine in its ?m= link; a link without ?m= goes to DEFAULT_MACHINE.
// askBeans shows the bean preference question (bean-to-cup machines only);
// setup shows side-by-side machines in the hero when two were on the table.
// beanOptions relabels its answers: [stored value, emoji, label, note]. The
// database only accepts red / black / any, so a machine reuses those values.
// notice shows a "good to know" card under the machine: { title, lines }.
window.MACHINES = {
  "k-x460": {
    name: "K-X460 – Fresh Milk",
    maker: "Lavazza",
    tagline: "Bean-to-cup from the Barista collection with a 10\" HD touchscreen, two bean hoppers, fresh milk and 20 drinks.",
    image: "https://s39409.pcdn.co/wp-content/uploads/2026/08/X460C5-DRIP-TRAY-scaled-e1788799357549.png.webp",
    link: "https://www.lavazzapro.co.uk/systems/bean-to-cup/k-x460-fresh-milk-coffee-machine/",
    notice: {
      title: "ℹ️ About today's demo",
      lines: [
        "Lavazza brought a <strong>smaller substitute machine</strong>, not the actual K-X460, which is bigger and bulkier.",
        "It ran low on cups and had to stop to clean itself during the demo. Please rate the coffee and the machine as best you can with that in mind.",
        "The beans you tried are <strong>one of 8 options</strong> Lavazza offers, so the taste can be changed.",
      ],
    },
    askBeans: false,
  },
  "k2-fresh-milk": {
    name: "K2 – Fresh Milk",
    maker: "Liquidline",
    tagline: "Bean-to-cup with a 10.1\" touchscreen, two bean hoppers and a built-in 5 litre fresh milk fridge.",
    image: "https://www.liquidline.co.uk/content/uploads/2025/08/Kalerm_Machine_Front_View_And_Fridge.jpg",
    link: "https://www.liquidline.co.uk/product/liquidline-k2-fresh-milk",
    setup: {
      machines: [
        { side: "Left", name: "K2 – Powdered Milk" },
        { side: "Right", name: "K2 – Fresh Milk", voting: true },
      ],
      note: "You're rating the fresh milk machine on the right. The coffee tastes different mainly because of the beans, not the machine.",
    },
    askBeans: true,
    beanQuestion: "Which coffee did you prefer?",
    beanOptions: [
      ["red", "⬅️", "Left", "left machine's coffee"],
      ["black", "➡️", "Right", "right machine's coffee"],
    ],
  },
  "momento-120": {
    name: "Momento 120",
    maker: "Nespresso",
    tagline: "Capsule machine with a touchscreen, 12 one-touch coffee and milk recipes and a fresh milk system.",
    image: "https://www.nespresso.com/ae/media/catalog/product/s/l/slide2-removebg-preview_2__1_1.png?optimize=high&fit=bounds&height=800&width=800&canvas=800:800",
    link: "https://www.nespresso.com/ae/en/pro/coffee-machines/momento-120-professional",
    askBeans: false,
  },
  "avari-b20": {
    name: "avari B20",
    maker: "Rijo42",
    tagline: "Fully automatic bean-to-cup with dual ceramic grinders, fresh milk and a 10.1\" touchscreen.",
    image: "https://imagedelivery.net/kzz3AF-LMfvcMM2MTvnAKg/ccbfe9f5-c50d-4692-827b-7c6b2bb46500/1000x1000",
    link: "https://www.rijo42.co.uk/coffee-machines/bean-cup-machines/avari-b20/",
    redBeans: true,
    askBeans: true,
  },
};
window.DEFAULT_MACHINE = "k-x460";
// Old links that should count towards a machine above.
window.MACHINE_ALIASES = { "coffee-machine": "avari-b20", "momento": "momento-120", "m120": "momento-120", "k2": "k2-fresh-milk", "kx460": "k-x460", "lavazza": "k-x460" };
// Bean answers for machines without their own beanOptions.
window.DEFAULT_BEAN_OPTIONS = [
  ["red", "🔴", "Red beans", "tasted today"],
  ["black", "⚫", "Regular black beans"],
  ["any", "🤷", "Don't mind"],
];
