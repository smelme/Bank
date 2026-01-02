import * as db from './database.js';import * as db from './database.js';import * as db from './database.js';



async function checkAllUsers() {

  try {

    // Check all usersasync function checkAllUsers() {async function checkUserAndLogs() {

    const users = await db.__debugListUsers();

    console.log('Total users in database:', users.length);  try {  try {

    console.log('All users:');

    users.forEach((user, i) => {    // Check all users    // Check if user exists

      console.log(`${i+1}. ${user.username} - ${user.email}`);

    });    const users = await db.__debugListUsers();    const user = await db.getUserByUsername('s.melese+89');



    // Check recent activity logs    console.log('Total users in database:', users.length);    console.log('User found:', user ? { id: user.id, username: user.username, email: user.email } : 'No user found');

    const logs = await db.getActivity({ limit: 20 });

    console.log('\nRecent activity logs:', logs.length, 'found');    console.log('All users:');

    if (logs.length > 0) {

      console.log('Recent logs:');    users.forEach((user, i) => {    if (user) {

      logs.forEach((log, i) => {

        console.log(`${i+1}. ${log.timestamp} - ${log.username} - ${log.auth_method} - ${log.success ? 'SUCCESS' : 'FAILED'}`);      console.log(`${i+1}. ${user.username} - ${user.email}`);      // Check activity logs for this user

      });

    }    });      const logs = await db.getActivity({ userId: user.id, limit: 10 });



    // Check recent auth events      console.log('Activity logs for user:', logs.length, 'found');

    const events = await db.pool?.query(

      'SELECT * FROM auth_events ORDER BY created_at DESC LIMIT 10'    // Check recent activity logs      if (logs.length > 0) {

    );

    console.log('\nRecent auth events:', events?.rows?.length || 0, 'found');    const logs = await db.getActivity({ limit: 20 });        console.log('Recent logs:');

    if (events?.rows?.length > 0) {

      console.log('Recent events:');    console.log('\nRecent activity logs:', logs.length, 'found');        logs.forEach((log, i) => {

      events.rows.forEach((event, i) => {

        console.log(`${i+1}. ${event.created_at} - ${event.username} - ${event.event_type} - ${event.result}`);    if (logs.length > 0) {          console.log(`${i+1}. ${log.timestamp} - ${log.auth_method} - ${log.success ? 'SUCCESS' : 'FAILED'} - ${log.ip_address}`);

      });

    }      console.log('Recent logs:');        });

  } catch (error) {

    console.error('Error:', error);      logs.forEach((log, i) => {      }

  }

}        console.log(`${i+1}. ${log.timestamp} - ${log.username} - ${log.auth_method} - ${log.success ? 'SUCCESS' : 'FAILED'}`);



checkAllUsers();      });      // Also check auth_events for comparison

    }      const events = await db.pool?.query(

        'SELECT * FROM auth_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',

    // Check recent auth events        [user.id]

    const events = await db.pool?.query(      );

      'SELECT * FROM auth_events ORDER BY created_at DESC LIMIT 10'      console.log('Auth events for user:', events?.rows?.length || 0, 'found');

    );      if (events?.rows?.length > 0) {

    console.log('\nRecent auth events:', events?.rows?.length || 0, 'found');        console.log('Recent events:');

    if (events?.rows?.length > 0) {        events.rows.forEach((event, i) => {

      console.log('Recent events:');          console.log(`${i+1}. ${event.created_at} - ${event.event_type} - ${event.result}`);

      events.rows.forEach((event, i) => {        });

        console.log(`${i+1}. ${event.created_at} - ${event.username} - ${event.event_type} - ${event.result}`);      }

      });    }

    }  } catch (error) {

  } catch (error) {    console.error('Error:', error);

    console.error('Error:', error);  }

  }}

}

checkUserAndLogs();
checkAllUsers();