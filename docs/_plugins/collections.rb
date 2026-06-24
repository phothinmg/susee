# frozen_string_literal: true

require "jekyll"

# Forces a dynamically created collection to read from a normal folder such as
# `app/docs` instead of Jekyll's default `_collection_name` directory pattern.
def define_custom_path_reader(site, collection, absolute_dir_path)
  # Override the relative path getter so Jekyll reads the target files.
  collection.define_singleton_method(:relative_directory) do
    # Strip the site source path to make it relative to the root.
    absolute_dir_path.sub("#{site.source}/", "")
  end
end

Jekyll::Hooks.register :site, :after_reset do |site|
  docs_dirs = %w[contents]
  docs_dirs.each do |dir|
    collection_name = File.join(site.source, dir)
    next if collection_name.start_with?("_")

    # Dynamically inject the collection config if not already defined
    next if site.config["collections"].key?(collection_name)

    permalink = dir == "contents" ? "/:path/" : "/#{dir}/:path/"

    site.config["collections"][collection_name] = {
      "output" => true,
      "permalink" => permalink
    }

    # Instantiate and register the Collection object
    new_collection = Jekyll::Collection.new(site, collection_name)
    site.collections[collection_name] = new_collection

    # Attach the custom path reader
    define_custom_path_reader(site, new_collection, collection_name)
  end
end
