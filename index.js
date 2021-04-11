const express = require('express');
const app = express();
const lib = require('pipedrive');
const { Octokit } = require("@octokit/core");

const PORT = 8080;

// TODO: take this out
lib.Configuration.apiToken = process.env.PIPEDRIVE_API_TOKEN;
const octokit = new Octokit({ auth: process.env.GITHUB_API_TOKEN });

app.set('json spaces', 2)

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

app.get('/deals', async (req, res) => {
  // const user = await lib.UsersController.getCurrentUserData();
  const deals = await lib.DealsController.getAllDeals({});
  res.json(deals);
});

app.get('/persons', async (req, res) => {
  // const user = await lib.UsersController.getCurrentUserData();
  const persons = await lib.PersonsController.getAllPersons({});
  res.json(persons);
});

app.get('/git', async (req, res) => {
  const response = await octokit.request("GET /users/{username}/gists", {
    username: 'gr2m',
  });
  res.json(response);
});

app.get('/create', async(req, res) => {
  try {
    const newPerson = await lib.PersonsController.addAPerson({
      body: {
        name: 'Robbie',
      }
    });

    const personId = newPerson.data.id;

    const newDeal = await lib.DealsController.addADeal({
      body: {
        title: 'deal from code 5',
        person_id: personId,
      }
    });

    const dealId = newDeal.data.id;

    lib.ActivitiesController.addAnActivity({
      subject: 'New Gist',
      // type: '',
      dealId: dealId,
      personId: personId,
    });
    res.status(500).send('OK');
  } catch (e) {
    console.log('Error:', e)
    res.status(500).send(e);
  }
});