const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const ctrl = require('../controllers/questionnaireController');

router.get('/', auth(true), ctrl.getQuestions);


router.get('/answers/latest', auth(true), ctrl.getLatestAnswers);
router.post('/answers', auth(true), ctrl.saveAnswers);  // Zapis odpowiedzi (bezpłatny)
router.get('/plan/latest', auth(true), ctrl.getLatestPlan);
router.put('/plan/latest', auth(true), ctrl.updateLatestPlan);

router.post('/submit', auth(true), ctrl.submitAnswers);
router.post('/plan/custom', auth(true), ctrl.saveCustomPlan);

module.exports = router;
