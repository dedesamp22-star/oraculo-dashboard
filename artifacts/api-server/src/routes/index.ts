import { Router, type IRouter } from "express";
import healthRouter from "./health";
import binanceRouter from "./binance";
import authRouter from "./auth";
import adminSimulationsRouter from "./admin-simulations";
import demoRouter from "./demo";
import notificationsRouter from "./notifications";
import workerRouter from "./worker";

const router: IRouter = Router();

router.use(healthRouter);
router.use(binanceRouter);
router.use(authRouter);
router.use(adminSimulationsRouter);
router.use(demoRouter);
router.use(notificationsRouter);
router.use(workerRouter);

export default router;
