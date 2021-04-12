const express = require('express');
const app = express();
const lib = require('pipedrive');
const { Octokit } = require("@octokit/core");

const PORT = 8080;
const PIPEDRIVE_GIST_TRACK = 'PIPEDRIVE_GIST_TRACK';

lib.Configuration.apiToken = process.env.PIPEDRIVE_API_TOKEN;
const octokit = new Octokit({ auth: process.env.GITHUB_API_TOKEN });

app.set('json spaces', 2)

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

app.get('/deals', async (req, res) => {
  // const user = await lib.UsersController.getCurrentUserData();
  try {
    const deals = await lib.DealsController.getAllDeals({});
    res.json(deals);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/persons', async (req, res) => {
  // const user = await lib.UsersController.getCurrentUserData();
  const persons = await lib.PersonsController.getAllPersons({});
  res.json(persons);
});

app.get('/git', async (req, res) => {
  try {
    const response = await octokit.request("GET /users/{username}/gists", {
      // username: 'gr2m',
      username: 'crypto-crypto-crypto',
      since: '2021-01-12T00:00:00Z',
    });
    const { data } = response;
    res.json(data);
  } catch (error) {
  }
});

app.get('/orgs', async (req, res) => {
  try {
    const orgs = await lib.OrganizationsController.getAllOrganizations({
      // userId: 12125319,
    });
    res.json(orgs);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/track', async (req, res) => {
  try {
    const { user } = req.query;
    const newDeal = await lib.DealsController.addADeal({
      body: {
        title: `Gist track for ${user}`,
        person_id: user,
        org_id: PIPEDRIVE_GIST_TRACK
      }
    });

    res.json(newDeal);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/fetch', async (req, res) => {
  try {
    const response = await lib.DealsController.getAllDeals({});
    const { data: deals = [] } = response;

    const dealUsers = {};

    const users = deals
      .filter(({ org_name }) => org_name === PIPEDRIVE_GIST_TRACK)
      .map(({ id, person_name }) => {
        dealUsers[person_name] = id;
        return person_name;
      });

    const usersRequest = users.map(user =>
      octokit.request("GET /users/{username}/gists", {
        username: user,
        since: '2021-01-01T00:00:00Z', // FIXME: make it dynamic
      }));

    const newActivitiesRequests = [];
    const usersGists = await Promise.all(usersRequest);

    usersGists.forEach(({ url, data: gistsUser = [] }) => {
      gistsUser.forEach((obj) => {
        const { id, description, owner, updated_at } = obj;
        const activityName = description || id;
        newActivitiesRequests.push(lib.ActivitiesController.addAnActivity({
          subject: activityName,
          dealId: dealUsers[owner.login],
          personId: dealUsers[owner.login],
          done: 0,
          note: id, // we store the id of the gist in the note
          // dueDate: updated_at.substring(0, 10), // YYYY-MM-DD
          // dueTime: updated_at.slice(11,16), // HH:MM
        }));
      });
    });

    const newActivities = await Promise.all(newActivitiesRequests);

    res.status(200).send('OK');
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/show', async (req, res) => {
  // Get activities of user
  try {
    const { user } = req.query;
    // get id of user based on username
    const { data } = await lib.PersonsController.findPersonsByName({
      term: user,
    });

    if (!data || data.length > 1) {
      throw new Error('User does not exist');
    }

    const { id: personId, name: username } = data[0];

    // filter only activities that haven't seen
    const activitiesResult = await lib.PersonsController.listActivitiesAssociatedWithAPerson({
      id: personId,
      done: 0,
    });

    const activitesUser = activitiesResult.data || [];

    let page = '';
    page += `<h1>${username}</h1>`;
    page += `<p>New gists: <b>${activitesUser.length}</b></p>`;

    activitesUser.forEach(({ subject, note: gistId }, i) => {
      page += `<h2>${i + 1}) ${subject}</h2><script src="https://gist.github.com/${username}/${gistId}.js"></script><hr>`
    });

    // update status of retireved activities after showing them
    const updateActivitiesRequest = activitesUser.map(
      ({ id }) => lib.ActivitiesController.updateEditAnActivity({
        id,
        done: 1,
      }));

    await Promise.all(updateActivitiesRequest);

    res.send(page);
  } catch (error) {
    res.send(error.toString());
  }
});

app.get('/create', async (req, res) => {
  try {
    const newPerson = await lib.PersonsController.addAPerson({
      body: {
        name: 'Robbie',
        // probably org id here
      }
    });

    const personId = newPerson.data.id;

    const dealsPerson = await lib.PersonsController.listDealsAssociatedWithAPerson({
      id: '3',
    });

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