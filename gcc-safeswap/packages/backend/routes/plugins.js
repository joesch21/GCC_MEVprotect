const router = require("express").Router();

router.get("/health", (_req,res)=> res.json({ ok: true }));

module.exports = router;
