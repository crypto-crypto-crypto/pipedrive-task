const express = require('express');
const morgan = require('morgan');
const lib = require('pipedrive');
const { Octokit } = require("@octokit/core");

const PORT = 8080;
const GITHUB_GISTS = 'GITHUB_GISTS';

const app = express();
app.use(morgan('tiny'));

lib.Configuration.apiToken = process.env.PIPEDRIVE_API_TOKEN;
const octokit = new Octokit({ auth: process.env.GITHUB_API_TOKEN });

app.set('json spaces', 2);

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

async function getPerson(user) {
  const { data } = await lib.PersonsController.findPersonsByName({
    term: user,
  });

  if (!data || data.length > 1) {
    return null;
  }

  const { id, name } = data[0];

  return { personId: id, username: name };
}

app.get('/list', async (req, res) => {
  try {
    const response = await lib.DealsController.getAllDeals({});
    const { data: deals = [] } = response;
    const persons = new Set();
    deals
      .filter(({ org_name }) => org_name === GITHUB_GISTS)
      .forEach(({ id, person_name, person_id: { value: personId } }) => persons.add(person_name));

    const scannedUsers = {
      success: true,
      data: [...persons],
    };

    res.json(scannedUsers);
  } catch (error) {
    res.status(500).json({
      success: false,
      error,
    });
  }
});

app.get('/new', async (req, res) => {
  try {
    const { user } = req.query;
    const person = await getPerson(user);

    if (person) {
      throw new Error(`User <b>${user}</b> has been added already`);
    }

    const newDeal = await lib.DealsController.addADeal({
      body: {
        title: `Gists for ${user}`,
        person_id: user,
        org_id: GITHUB_GISTS,
      }
    });

    res.send(`User <b>${user}</b> added successfully`);
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

app.get('/fetch', async (req, res) => {
  try {
    const response = await lib.DealsController.getAllDeals({});
    const { data: deals = [] } = response;
    const dealUsers = {};
    const personsIds = new Set();
    const users = deals
      .filter(({ org_name }) => org_name === GITHUB_GISTS)
      .map(({ id, person_name, person_id: { value: personId } }) => {
        dealUsers[person_name] = id;
        personsIds.add(personId);
        return person_name;
      });

    const activitiesPersonsRequest = [...personsIds].map(id =>
      lib.PersonsController.listActivitiesAssociatedWithAPerson({ id }));

    const activitiesUsers = {};
    const activitiesResult = await Promise.all(activitiesPersonsRequest);

    activitiesResult.forEach(({ data: activitiesUser }) => {
      if (!activitiesUser) {
        return;
      }

      activitiesUser.forEach(({ person_name, note }) => {
        if (!note) {
          return;
        }

        if (!activitiesUsers[person_name]) {
          activitiesUsers[person_name] = new Set();
        }

        activitiesUsers[person_name].add(note);
      });
    });

    const usersGistsRequest = users.map(user =>
      octokit.request("GET /users/{username}/gists", {
        username: user,
        // since: '2021-01-01T00:00:00Z', // FIXME: make it dynamic
      }));

    const newActivitiesRequests = [];
    const usersGists = await Promise.all(usersGistsRequest);
    let counterTotalNewGists = 0;

    usersGists.forEach(({ url, data: gistsUser = [] }) => {
      gistsUser.forEach(gist => {
        const { id, description, owner: { login: username }, updated_at } = gist;
        const currentActivities = activitiesUsers[username];

        // If the gist is already fetched, skip it
        if (currentActivities && currentActivities.has(id)) {
          return;
        }

        const activityName = description || id;
        newActivitiesRequests.push(lib.ActivitiesController.addAnActivity({
          subject: activityName,
          dealId: dealUsers[username],
          personId: dealUsers[username],
          done: 0,
          note: id, // we store the id of the gist in the note
          // dueDate: updated_at.substring(0, 10), // YYYY-MM-DD
          // dueTime: updated_at.slice(11,16), // HH:MM
        }));
        counterTotalNewGists++;
      });
    });

    await Promise.all(newActivitiesRequests);

    res.status(200).send(`New gists: <b>${counterTotalNewGists}</b>`);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/updates', async (req, res) => {
  // Get activities of user
  try {
    const { user } = req.query;

    // get id of user based on username
    const person = await getPerson(user);

    if (!person) {
      throw new Error('User does not exist');
    }

    const { personId, username } = person;

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
