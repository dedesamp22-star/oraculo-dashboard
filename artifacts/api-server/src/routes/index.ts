import { Router, type IRouter } from "express";
import healthRouter from "./health";
import binanceRouter from "./binance";
import authRouter from "./auth";
import demoRouter from "./demo";
import workerRouter from "./worker";

const router: IRouter = Router();

router.use(healthRouter);
router.use(binanceRouter);
router.use(authRouter);
router.use(demoRouter);
router.use(workerRouter);

export default router;
