// Machines we demo. The vote page shows the photo, link and notes for the
// machine in its ?m= link; a link without ?m= goes to DEFAULT_MACHINE.
window.MACHINES = {
  "avari-b20": {
    name: "avari B20",
    maker: "Rijo42",
    tagline: "Fully automatic bean-to-cup with dual ceramic grinders, fresh milk and a 10.1\" touchscreen.",
    image: "https://imagedelivery.net/kzz3AF-LMfvcMM2MTvnAKg/ccbfe9f5-c50d-4692-827b-7c6b2bb46500/1000x1000",
    link: "https://www.rijo42.co.uk/coffee-machines/bean-cup-machines/avari-b20/",
    redBeans: true,
  },
};
window.DEFAULT_MACHINE = "avari-b20";
// Old links that should count towards a machine above.
window.MACHINE_ALIASES = { "coffee-machine": "avari-b20" };
