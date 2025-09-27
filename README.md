## Getting Started

1. Clone the repository:

   ```
   git clone https://github.com/13point5/open-artifacts.git
   ```

1. Navigate to the project directory:

   ```
   cd open-artifacts
   ```

### Supabase Setup

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started#installing-the-supabase-cli)

1. Create a Supabase project

1. Initialize Supabase locally

   ```
   supabase init
   ```

1. Link your local project to your remote Supabase project

   ```
   supabase link --project-ref <your-project-ref>
   ```

1. Apply Migrations

   ```
   supabase db push
   ```

1. Copy env variables from your Supabase project

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

### App Setup

1. Install dependencies:

   ```
   npm install
   ```

1. Run the development server:

   ```
   npm run dev
   ```

1. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.