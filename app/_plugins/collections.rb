# frozen_string_literal: true

require 'jekyll'

def mmdocs_collections(site)
  mmdocs_config = site.config['mmdocs']

  mmdocs_sections = Array(mmdocs_config['docs']) + Array(mmdocs_config['posts'])

  return if mmdocs_sections.empty?

  mmdocs_sections.each_with_object([]) do |section, mmdocs_dirs|
    dir = section['dir'] || section[:dir]
    mmdocs_dirs << { dir: dir }
  end
end

def check_exists(collection, dir)
  unless File.directory?(collection) # rubocop:disable Style/GuardClause
    Jekyll.logger.info('', '-----------------------------------------------------------')
    Jekyll.logger.error('', "\tTheme Error:")
    Jekyll.logger.info('', "\tDirectory '#{dir}' dose not exists.")
    Jekyll.logger.info('', '------------------------------------------------------------')
    # Exit silently without printing the backtrace or error message
    # Use 'exit!(1)'' instead of a standard 'exit 1'
    exit!(1)
  end
end

# Forces a dynamically created collection to read from a normal folder such as
# `app/docs` instead of Jekyll's default `_collection_name` directory pattern.
def define_custom_path_reader(site, collection, absolute_dir_path)
  # Override the relative path getter so Jekyll reads the target files.
  collection.define_singleton_method(:relative_directory) do
    # Strip the site source path to make it relative to the root.
    absolute_dir_path.sub("#{site.source}/", '')
  end
end

Jekyll::Hooks.register :site, :after_reset do |site|
  docs_dirs = mmdocs_collections(site)
  next if docs_dirs.nil? || docs_dirs.empty?

  docs_dirs.each do |entry|
    dir = entry['dir'] || entry[:dir]
    collection_name = File.join(site.source, dir)

    check_exists(collection_name, dir)
    next if collection_name.start_with?('_')

    # Dynamically inject the collection config if not already defined
    next if site.config['collections'].key?(collection_name)

    site.config['collections'][collection_name] = {
      'output' => true,
      'permalink' => "/#{collection_name}/:path/"
    }

    # Instantiate and register the Collection object
    new_collection = Jekyll::Collection.new(site, collection_name)
    site.collections[collection_name] = new_collection

    # Attach the custom path reader
    define_custom_path_reader(site, new_collection, collection_name)
  end
end
