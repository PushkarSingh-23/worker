export default {
  async fetch(request, env, ctx) {
    const DB = env.DATABASE;  // Use env.DATABASE to access the database binding

    if (!DB) {
      return new Response('D1 database not available', { status: 500 });
    }

    // Run the table creation query once when the worker is initialized
    try {
      await createTableIfNotExists(DB);
      await createUserTableIfNotExists(DB); // Ensure the user table exists
    } catch (err) {
      console.error('Error creating tables:', err);
      return new Response('Failed to create tables!', { status: 500 });
    }

    // Handle POST requests to insert data into the user table
    if (request.method === 'POST' && request.url.includes('/adduser')) {
      try {
        const body = await request.json();
        console.log('Parsed request body:', body);

        if (body.username && body.password) {
          // Check if the user already exists
          const checkUserQuery = `
            SELECT id FROM user WHERE LOWER(username) = LOWER(?);
          `;
          const existingUser = await DB.prepare(checkUserQuery).bind(body.username).all();

          if (existingUser.results.length > 0) {
            return new Response('User already exists!', { status: 400 });
          }

          const query = `
            INSERT INTO user (username, password)
            VALUES (?, ?);
          `;
          console.log('Executing query:', query);
          const result = await DB.prepare(query)
                                  .bind(body.username, body.password)
                                  .run();

          console.log('Query result:', result);

          if (result.success) {
            return new Response('User added successfully!', { status: 200 });
          } else {
            return new Response('Failed to insert user!', { status: 500 });
          }
        } else {
          return new Response('Invalid data format! Both username and password are required.', { status: 400 });
        }
      } catch (err) {
        console.error('Error processing request:', err);
        return new Response('Error processing request: ' + err.message, { status: 500 });
      }
    }

    // Handle POST requests to insert data into the clients table (existing code)
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        console.log('Parsed request body:', body);

        if (body.status === 'CREATION_SUCCESS' && body.account_id && body.name) {
          const query = `
            INSERT INTO clients (status, account_id, name)
            VALUES (?, ?, ?);
          `;
          console.log('Executing query:', query);
          const result = await DB.prepare(query)
                                  .bind(body.status, body.account_id, body.name)
                                  .run();

          console.log('Query result:', result);

          if (result.success) {
            return new Response('Data added successfully!', { status: 200 });
          } else {
            return new Response('Failed to insert data!', { status: 500 });
          }
        } else {
          return new Response('Invalid data format!', { status: 400 });
        }
      } catch (err) {
        console.error('Error processing request:', err);
        return new Response('Error processing request: ' + err.message, { status: 500 });
      }
    }

    // Handle GET requests to retrieve both account_id and password for a given username
    if (request.method === 'GET' && request.url.includes('/user')) {
      const url = new URL(request.url);
      console.log('Request URL:', request.url);  // Log the full URL to debug
      const username = url.searchParams.get('username');  // Get the username from query params

      if (!username) {
        return new Response('Username is required', { status: 400 });
      }

      // Trim whitespace and convert username to lowercase for case-insensitive matching
      const cleanedUsername = username.trim().toLowerCase();
      console.log('Searching for username:', cleanedUsername);  // Log username being searched

      try {
        // Use a JOIN query to fetch both account_id from clients and password from user table
        const query = `
          SELECT clients.account_id, user.password
          FROM clients
          JOIN user ON LOWER(clients.name) = LOWER(user.username)
          WHERE LOWER(user.username) = LOWER(?) LIMIT 1;
        `;
        const result = await DB.prepare(query).bind(cleanedUsername).all();

        console.log('Query result:', result);  // Log the result to check the database response

        if (result.results.length > 0) {
          const { account_id, password } = result.results[0]; // Extract account_id and password from the result
          return new Response(JSON.stringify({ account_id, password }), { status: 200 });
        } else {
          return new Response('User not found', { status: 404 });
        }
      } catch (err) {
        console.error('Error retrieving user:', err);
        return new Response('Error retrieving user: ' + err.message, { status: 500 });
      }
    }

    // Handle POST requests for /checkuser to verify username and password
    if (request.method === 'POST' && request.url.includes('/checkuser')) {
      try {
        console.log('Received POST request for /checkuser endpoint');
        
        const body = await request.json();
        console.log('Parsed request body:', body.username);  // Log the body to ensure it's correctly parsed
    
        // Log types of username and password
        console.log('Type of username:', typeof body.username);
        console.log('Type of password:', typeof body.password);
    
        // Check if username and password exist and are strings
        if (typeof body.username === 'string' && typeof body.password === 'string') {
          const username = body.username.trim();
          const password = body.password.trim();
    
          // Log trimmed values to ensure there are no invisible characters or spaces
          console.log('Trimmed username:', username);
          console.log('Trimmed password:', password);
    
          // Validate that both username and password are non-empty strings
          if (username && password) {
            console.log('Username and password are present, proceeding with verification');
            
            // Log SQL query
            const checkUserQuery = `
              SELECT id FROM user WHERE LOWER(username) = LOWER(?) AND password = ?;
            `;
            console.log('Executing query:', checkUserQuery);
            
            // Execute the query
            const result = await DB.prepare(checkUserQuery).bind(username, password).all();
            console.log('Query result:', result);  // Log the result to check if the query executed properly
    
            if (result && result.results && result.results.length > 0) {
              console.log('User verified successfully');
              return new Response('User verified', { status: 200 });
            } else {
              console.log('No matching user found, incorrect username or password');
              return new Response('Username or password is incorrect', { status: 401 });
            }
          } else {
            console.log('Invalid data format! Both username and password must be non-empty');
            return new Response('Invalid data format! Both username and password are required.', { status: 400 });
          }
        } else {
          console.log('Invalid data format! Username and password must be strings');
          return new Response('Invalid data format! Username and password must be strings.', { status: 400 });
        }
      } catch (err) {
        console.error('Error verifying user:', err);
        return new Response('Error verifying user: ' + err.message, { status: 500 });
      }
    }
    // Default response for unsupported methods
    return new Response('Method Not Allowed', { status: 405 });
  },
};

// Helper function to create the table if it doesn't exist
async function createTableIfNotExists(DB) {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT,
      account_id TEXT,
      name TEXT
    );
  `;
  try {
    console.log('Creating clients table if not exists...');
    await DB.prepare(createTableQuery).run();
  } catch (err) {
    console.error('Error creating clients table:', err);
    throw err;
  }
}

// Helper function to create the user table if it doesn't exist
async function createUserTableIfNotExists(DB) {
  const createUserTableQuery = `
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password TEXT NOT NULL
    );
  `;
  try {
    console.log('Creating user table if not exists...');
    await DB.prepare(createUserTableQuery).run();
  } catch (err) {
    console.error('Error creating user table:', err);
    throw err;
  }
}
